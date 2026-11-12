package com.mirinae.market.modules.auth.data;

import java.time.Duration;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** OAuth state·미완료 흐름·탈퇴 재인증 확인을 Redis에 TTL로 보관한다. Redis 재시작 시 모두 사라지며 사용자는 다시 시작한다. */
@Component
public class RedisOAuthStore {
  private static final String STATE_PREFIX = "auth:oauth:state:";
  private static final String FLOW_PREFIX = "auth:oauth:flow:";

  private static final String CONSUME_SCRIPT =
      """
      local value = redis.call('GET', KEYS[1])
      if not value then return nil end
      redis.call('DEL', KEYS[1])
      return value
      """;

  private final StringRedisTemplate redis;
  private final DefaultRedisScript<String> consumeScript;
  private final JsonMapper mapper = JsonMapper.builder().build();

  public RedisOAuthStore(StringRedisTemplate redis) {
    this.redis = redis;
    this.consumeScript = new DefaultRedisScript<>(CONSUME_SCRIPT, String.class);
  }

  /** 일회성 state를 저장한다. 브라우저 바인딩·목적·제공자·PKCE 검증값에 묶는다. */
  public void saveState(String state, String payload, Duration ttl) {
    write(STATE_PREFIX + state, payload, ttl);
  }

  /** state를 한 번만 소비한다. 없으면 null이다. */
  public String consumeState(String state) {
    return consume(STATE_PREFIX + state);
  }

  public void saveFlow(OAuthFlowRecord flow, Duration ttl) {
    write(FLOW_PREFIX + flow.flowId(), mapper.writeValueAsString(flow), ttl);
  }

  /** 흐름을 조회한다. 쓰기 없이 화면 표시에만 사용한다. */
  public OAuthFlowRecord flow(String flowId) {
    String json = read(FLOW_PREFIX + flowId);
    return json == null ? null : mapper.readValue(json, OAuthFlowRecord.class);
  }

  /** 흐름을 원자적으로 한 번만 소비한다. 동시에 같은 proof가 제출돼도 GETDEL은 하나만 값을 받고 나머지는 null을 받는다. */
  public OAuthFlowRecord consumeFlow(String flowId) {
    if (flowId == null || flowId.isBlank()) return null;
    String json = consume(FLOW_PREFIX + flowId);
    return json == null ? null : mapper.readValue(json, OAuthFlowRecord.class);
  }

  /** 남아 있는 흐름을 삭제한다. */
  public void deleteFlow(String flowId) {
    try {
      redis.delete(FLOW_PREFIX + flowId);
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }

  private void write(String key, String value, Duration ttl) {
    try {
      redis.opsForValue().set(key, value, ttl);
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }

  private String read(String key) {
    try {
      return redis.opsForValue().get(key);
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }

  private String consume(String key) {
    try {
      return redis.execute(consumeScript, List.of(key));
    } catch (DataAccessException exception) {
      throw new AuthStorageUnavailableException(exception);
    }
  }
}
