package com.mirinae.market.modules.auth.data;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * 로그인별 인증 상태를 Redis Hash로 관리한다. 키 TTL은 필드가 아니라 키에 설정하며, 저장된 절대·유휴 기한은 애플리케이션 Clock으로 계산해 비교한다. 회전
 * 검증·재사용 탐지·새 해시 갱신은 단일 Lua 스크립트로 원자적으로 수행한다.
 */
@Component
public class RedisLoginStore {
  private static final String KEY_PREFIX = "auth:login:";

  private static final String VALIDATE_SCRIPT =
      """
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local accountId = ARGV[2]
      local authVersion = ARGV[3]
      local idleTtl = tonumber(ARGV[4])
      local state = redis.call('HMGET', key, 'accountId', 'authVersion', 'revoked', 'absoluteExpiresAt', 'idleExpiresAt')
      if not state[1] then return 'MISSING' end
      if state[3] == '1' then return 'REVOKED' end
      if state[1] ~= accountId or state[2] ~= authVersion then return 'STALE' end
      local absolute = tonumber(state[4])
      local idle = tonumber(state[5])
      if now >= absolute or now >= idle then
        redis.call('DEL', key)
        return 'EXPIRED'
      end
      local nextIdle = math.min(now + idleTtl, absolute)
      redis.call('HSET', key, 'idleExpiresAt', tostring(nextIdle))
      local remaining = absolute - now
      if nextIdle - now < remaining then remaining = nextIdle - now end
      if remaining > 0 then redis.call('PEXPIRE', key, remaining) end
      return 'OK'
      """;

  private static final String ROTATE_SCRIPT =
      """
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local accountId = ARGV[2]
      local authVersion = ARGV[3]
      local presentedGen = tonumber(ARGV[4])
      local presentedHash = ARGV[5]
      local newGen = tonumber(ARGV[6])
      local newHash = ARGV[7]
      local idleTtl = tonumber(ARGV[8])
      local state = redis.call('HMGET', key, 'accountId', 'authVersion', 'revoked', 'generation', 'refreshHash', 'absoluteExpiresAt', 'idleExpiresAt')
      if not state[1] then return 'MISSING' end
      if state[3] == '1' then return 'REVOKED' end
      if state[1] ~= accountId or state[2] ~= authVersion then return 'STALE' end
      local absolute = tonumber(state[6])
      local idle = tonumber(state[7])
      if now >= absolute or now >= idle then
        redis.call('DEL', key)
        return 'EXPIRED'
      end
      local currentGen = tonumber(state[4])
      if presentedGen < currentGen then
        redis.call('DEL', key)
        return 'REUSED'
      end
      if presentedGen > currentGen then return 'INVALID' end
      if state[5] ~= presentedHash then return 'INVALID' end
      local nextIdle = math.min(now + idleTtl, absolute)
      redis.call('HSET', key, 'generation', tostring(newGen), 'refreshHash', newHash, 'idleExpiresAt', tostring(nextIdle))
      local remaining = absolute - now
      if nextIdle - now < remaining then remaining = nextIdle - now end
      if remaining > 0 then redis.call('PEXPIRE', key, remaining) end
      return 'OK'
      """;

  private static final String CREATE_SCRIPT =
      """
      local key = KEYS[1]
      local absolute = tonumber(ARGV[5])
      local idle = tonumber(ARGV[6])
      local now = tonumber(ARGV[7])
      if now >= absolute or now >= idle then return 'EXPIRED' end
      redis.call('HSET', key, 'accountId', ARGV[1], 'authVersion', ARGV[2], 'refreshHash', ARGV[3],
        'generation', ARGV[4], 'absoluteExpiresAt', ARGV[5], 'idleExpiresAt', ARGV[6], 'revoked', '0')
      -- 앱 Clock 기준 잔여 기간을 PEXPIRE로 설정한다. 과거 고정 시각에서도 남은 수명이 올바르다.
      redis.call('PEXPIRE', key, idle - now)
      return 'OK'
      """;

  private final StringRedisTemplate redis;
  private final Clock clock;
  private final DefaultRedisScript<String> validateScript;
  private final DefaultRedisScript<String> rotateScript;
  private final DefaultRedisScript<String> createScript;

  public RedisLoginStore(StringRedisTemplate redis, Clock clock) {
    this.redis = redis;
    this.clock = clock;
    this.validateScript = new DefaultRedisScript<>(VALIDATE_SCRIPT, String.class);
    this.rotateScript = new DefaultRedisScript<>(ROTATE_SCRIPT, String.class);
    this.createScript = new DefaultRedisScript<>(CREATE_SCRIPT, String.class);
  }

  public void create(
      String sid,
      long accountId,
      long authVersion,
      String refreshHash,
      long generation,
      Instant absoluteExpiresAt,
      Instant idleExpiresAt,
      Duration idleTtl) {
    String key = KEY_PREFIX + sid;
    long now = clock.millis();
    long idle = Math.min(idleExpiresAt.toEpochMilli(), now + idleTtl.toMillis());
    String result =
        execute(
            createScript,
            key,
            Long.toString(accountId),
            Long.toString(authVersion),
            refreshHash,
            Long.toString(generation),
            Long.toString(absoluteExpiresAt.toEpochMilli()),
            Long.toString(idle),
            Long.toString(now));
    if (!"OK".equals(result)) {
      throw new IllegalStateException("로그인 상태를 만들지 못했습니다.");
    }
  }

  /** access 요청의 로그인 상태를 확인하고 유휴 기한을 연장한다. */
  public LoginState validate(String sid, long accountId, long authVersion, Duration idleTtl) {
    String result =
        execute(
            validateScript,
            KEY_PREFIX + sid,
            Long.toString(clock.millis()),
            Long.toString(accountId),
            Long.toString(authVersion),
            Long.toString(idleTtl.toMillis()));
    return switch (result == null ? "" : result) {
      case "OK" -> LoginState.OK;
      case "STALE" -> LoginState.STALE;
      case "REVOKED", "MISSING" -> LoginState.MISSING;
      default -> LoginState.EXPIRED;
    };
  }

  /** refresh 회전을 원자적으로 수행한다. */
  public RotationResult rotate(
      String sid,
      long accountId,
      long authVersion,
      long presentedGeneration,
      String presentedHash,
      long newGeneration,
      String newHash,
      Duration idleTtl) {
    String result =
        execute(
            rotateScript,
            KEY_PREFIX + sid,
            Long.toString(clock.millis()),
            Long.toString(accountId),
            Long.toString(authVersion),
            Long.toString(presentedGeneration),
            presentedHash,
            Long.toString(newGeneration),
            newHash,
            Long.toString(idleTtl.toMillis()));
    return switch (result == null ? "" : result) {
      case "OK" -> RotationResult.ROTATED;
      case "REUSED" -> RotationResult.REUSED;
      case "STALE" -> RotationResult.STALE;
      default -> RotationResult.INVALID;
    };
  }

  /** 현재 로그인 상태를 폐기한다. 이미 없으면 아무 일도 하지 않는다. */
  public void revoke(String sid) {
    try {
      redis.delete(KEY_PREFIX + sid);
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }

  private String execute(DefaultRedisScript<String> script, String key, String... args) {
    try {
      return redis.execute(script, List.of(key), (Object[]) args);
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }

  public enum LoginState {
    OK,
    STALE,
    MISSING,
    EXPIRED
  }

  public enum RotationResult {
    ROTATED,
    REUSED,
    STALE,
    INVALID
  }
}
