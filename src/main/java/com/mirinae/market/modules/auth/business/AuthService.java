package com.mirinae.market.modules.auth.business;

import com.mirinae.market.modules.account.business.AccountAuthGateway;
import com.mirinae.market.modules.account.business.AccountAuthentication;
import com.mirinae.market.modules.auth.data.JwtTokens;
import com.mirinae.market.modules.auth.data.RedisLoginStore;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 로컬 ID·비밀번호 로그인, access 검증, refresh 회전, 로그아웃을 담당한다. 발급·검증·Redis 기한은 모두 같은 주입 Clock을 사용하므로 E2E 고정
 * 시각에서도 성립한다.
 */
@Service
public class AuthService {
  private final AccountAuthGateway accounts;
  private final JwtTokens tokens;
  private final RedisLoginStore logins;
  private final PasswordEncoder encoder;
  private final Clock clock;
  private final AuthPolicy policy;

  AuthService(
      AccountAuthGateway accounts,
      JwtTokens tokens,
      RedisLoginStore logins,
      PasswordEncoder encoder,
      Clock clock,
      AuthPolicy policy) {
    this.accounts = accounts;
    this.tokens = tokens;
    this.logins = logins;
    this.encoder = encoder;
    this.clock = clock;
    this.policy = policy;
  }

  public AuthPolicy policy() {
    return policy;
  }

  /** 로컬 ID·비밀번호 로그인이다. 성공 시 refresh 원문을 함께 돌려준다. */
  public LoginResult login(String loginId, String password) {
    AccountAuthentication account =
        accounts
            .accountForAuthentication(loginId)
            .filter(AccountAuthentication::active)
            .orElse(null);
    if (account == null
        || !account.hasLocalPassword()
        || password == null
        || password.isEmpty()
        || !encoder.matches(password, account.passwordHash())) {
      throw AuthException.invalidCredentials();
    }
    return issueForAccount(account);
  }

  /** 새 기기 로그인 상태를 만들고 access/refresh를 발급한다. */
  public LoginResult issueForAccount(AccountAuthentication account) {
    String sid = AuthSecrets.randomToken();
    Instant now = Instant.now(clock);
    Instant absoluteExpiresAt = now.plus(policy.absoluteTtl());
    String refresh = tokens.refresh(account.id(), sid, account.authVersion(), 0, absoluteExpiresAt);
    logins.create(
        sid,
        account.id(),
        account.authVersion(),
        AuthSecrets.hash(refresh),
        0,
        absoluteExpiresAt,
        now.plus(policy.idleTtl()),
        policy.idleTtl());
    String access =
        tokens.access(
            account.id(),
            sid,
            account.role(),
            account.authVersion(),
            policy.accessTtl(),
            absoluteExpiresAt);
    return new LoginResult(access, refresh, policy.accessTtl(), account.role(), sid);
  }

  /** 보호 요청의 access를 검증한다. Redis 상태·현재 계정 버전·활성 여부를 함께 확인한다. */
  public AuthenticatedUser authenticate(String accessToken) {
    JwtTokens.ParsedToken parsed = tokens.parseAccess(accessToken);
    if (parsed == null) return null;
    Optional<AccountAuthentication> account =
        accounts.accountForAuthentication(parsed.accountId()).filter(AccountAuthentication::active);
    if (account.isEmpty()) {
      // 계정이 없거나 비활성이면 남은 로그인 상태를 정리한다.
      logins.revoke(parsed.sid());
      return null;
    }
    AccountAuthentication current = account.orElseThrow();
    if (current.authVersion() != parsed.authVersion()) {
      logins.revoke(parsed.sid());
      return null;
    }
    return switch (logins.validate(
        parsed.sid(), current.id(), current.authVersion(), policy.idleTtl())) {
      case OK ->
          new AuthenticatedUser(
              current.id(), current.loginId(), current.role(), current.authVersion(), parsed.sid());
      case STALE, MISSING, EXPIRED -> null;
    };
  }

  /** refresh 쿠키로 access를 복원한다. 회전은 원자적으로 한 번만 성공하고 만료는 최초 절대 기한을 유지한다. */
  public Refreshed refresh(String refreshToken) {
    JwtTokens.ParsedToken parsed = tokens.parseRefresh(refreshToken);
    if (parsed == null) throw AuthException.unauthenticated();
    AccountAuthentication account =
        accounts
            .accountForAuthentication(parsed.accountId())
            .filter(AccountAuthentication::active)
            .orElseThrow(AuthException::unauthenticated);
    if (account.authVersion() != parsed.authVersion()) {
      logins.revoke(parsed.sid());
      throw AuthException.unauthenticated();
    }
    Instant absoluteExpiresAt = parsed.expiresAt();
    long nextGeneration = parsed.generation() + 1;
    String nextRefresh =
        tokens.refresh(
            account.id(), parsed.sid(), account.authVersion(), nextGeneration, absoluteExpiresAt);
    RedisLoginStore.RotationResult result =
        logins.rotate(
            parsed.sid(),
            account.id(),
            account.authVersion(),
            parsed.generation(),
            AuthSecrets.hash(refreshToken),
            nextGeneration,
            AuthSecrets.hash(nextRefresh),
            policy.idleTtl());
    return switch (result) {
      case ROTATED -> {
        String access =
            tokens.access(
                account.id(),
                parsed.sid(),
                account.role(),
                account.authVersion(),
                policy.accessTtl(),
                absoluteExpiresAt);
        Duration refreshRemaining = Duration.between(Instant.now(clock), absoluteExpiresAt);
        yield new Refreshed(
            access,
            nextRefresh,
            policy.accessTtl(),
            refreshRemaining,
            account.role(),
            parsed.sid());
      }
      case REUSED -> throw AuthException.refreshReused();
      case STALE, INVALID -> throw AuthException.unauthenticated();
    };
  }

  /**
   * 로그아웃한다. 서명이 검증된 Bearer·refresh의 sid만 폐기하며, 둘이 서로 다른 유효 로그인이면 제공된 양쪽만 정리한다. 어떤 로그인도 폐기할 수 없는 경우도
   * 쿠키 삭제 후 성공으로 처리한다. Redis 장애는 예외로 전파해 503이 되게 한다.
   */
  public void logout(String accessToken, String refreshToken) {
    JwtTokens.ParsedToken access = tokens.parseAccess(accessToken);
    JwtTokens.ParsedToken refresh = tokens.parseRefresh(refreshToken);
    if (access != null) {
      logins.revoke(access.sid());
    }
    if (refresh != null && (access == null || !refresh.sid().equals(access.sid()))) {
      logins.revoke(refresh.sid());
    }
  }

  /** 인증된 본인의 계정 요약과 로그인 수단을 반환한다. */
  public AuthMe me(AuthenticatedUser user) {
    var summary = accounts.summary(user.loginId());
    var authentication = accounts.accountForAuthentication(user.accountId()).orElseThrow();
    return new AuthMe(
        summary.id(),
        summary.loginId(),
        summary.displayName(),
        summary.role(),
        summary.requiresPasswordChange(),
        authentication.hasLocalPassword(),
        accounts.linkedProviders(user.accountId()));
  }

  /** 로그인·발급 결과다. refresh 원문은 쿠키로만 전달한다. */
  public record LoginResult(
      String accessToken, String refreshToken, Duration accessTtl, String role, String sid) {}

  public record Refreshed(
      String accessToken,
      String refreshToken,
      Duration accessTtl,
      Duration refreshRemaining,
      String role,
      String sid) {}
}
