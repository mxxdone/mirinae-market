package com.mirinae.market.modules.auth.business;

import com.mirinae.market.modules.account.business.AccountAuthGateway;
import com.mirinae.market.modules.account.business.AccountAuthentication;
import com.mirinae.market.modules.account.business.DuplicateAccountException;
import com.mirinae.market.modules.account.business.EmailRule;
import com.mirinae.market.modules.auth.data.OAuthFlowRecord;
import com.mirinae.market.modules.auth.data.OAuthProviderClient;
import com.mirinae.market.modules.auth.data.OAuthProviderUnavailableException;
import com.mirinae.market.modules.auth.data.ProviderUser;
import com.mirinae.market.modules.auth.data.RedisOAuthStore;
import java.util.List;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * OAuth 2.0 Code+PKCE 가입·로그인·연결·탈퇴 재인증 흐름을 담당한다. state·흐름·재인증 확인은 Redis에만 TTL로 보관하고 브라우저에는 흐름 ID만
 * HttpOnly 쿠키로 전달한다. 제공자 code/id/email은 브라우저 입력으로 신뢰하지 않는다.
 */
@Service
public class OAuthService {
  private final AccountAuthGateway accounts;
  private final OAuthProviderClient providers;
  private final RedisOAuthStore store;
  private final AuthService auth;
  private final PasswordEncoder encoder;

  OAuthService(
      AccountAuthGateway accounts,
      OAuthProviderClient providers,
      RedisOAuthStore store,
      AuthService auth,
      PasswordEncoder encoder) {
    this.accounts = accounts;
    this.providers = providers;
    this.store = store;
    this.auth = auth;
    this.encoder = encoder;
  }

  public List<String> providers() {
    return providers.configuredProviders();
  }

  /** 로그인·연결·탈퇴 재인증 흐름을 시작한다. link는 유효한 미완료 연결 흐름이, withdraw는 소셜 전용 구매자 로그인이 필요하다. */
  public StartResult start(
      String provider,
      String purpose,
      String browserBinding,
      String pendingFlowId,
      AuthenticatedUser user,
      AuthPolicy policy) {
    if (!providers.available(provider)) throw AuthException.unavailable();
    OAuthFlowRecord pending;
    if ("link".equals(purpose)) {
      pending = store.flow(pendingFlowId);
      if (pending == null
          || !"LINK".equals(pending.status())
          || pending.candidateAccountId() == null
          || pending.candidateAuthVersion() == null) {
        throw AuthException.flowExpired();
      }
    } else if ("withdraw".equals(purpose)) {
      if (user == null) throw AuthException.unauthenticated();
      if (!"BUYER".equals(user.role())) throw AuthException.forbidden();
      if (!accounts.socialOnly(user.accountId())) {
        throw AuthException.invalidInput("비밀번호로 본인 확인하는 계정입니다.");
      }
      pending =
          OAuthFlowRecord.reauthFlow(
              AuthSecrets.randomToken(),
              provider,
              user.accountId(),
              user.sid(),
              user.authVersion(),
              false,
              null,
              null,
              null);
      store.saveFlow(pending, policy.reauthTtl());
    } else if (!"login".equals(purpose)) {
      throw AuthException.invalidInput("소셜 로그인 목적을 확인해 주세요.");
    } else {
      pending = null;
    }

    String state = AuthSecrets.randomToken();
    String verifier = AuthSecrets.randomToken();
    boolean freshBinding = browserBinding == null || browserBinding.isBlank();
    String binding = freshBinding ? AuthSecrets.randomToken() : browserBinding;
    String redirectUri = policy.publicBaseUrl() + "/api/auth/oauth/" + provider + "/callback";
    store.saveState(
        state,
        statePayload(provider, purpose, binding, verifier, redirectUri, pending),
        policy.stateTtl());
    String url =
        providers.authorizationUrl(
            provider, purpose, state, AuthSecrets.challenge(verifier), redirectUri);
    return new StartResult(
        url, freshBinding ? binding : null, pending == null ? null : pending.flowId());
  }

  /**
   * 콜백을 처리한다. state 소비·브라우저 바인딩·제공자 검증을 먼저 통과해야 하며, 실패하면 회원 생성·연결·자동 로그인 없이 ERROR 흐름을 만든다. 제공자
   * 거절(error)도 state를 소비한 뒤 처리해 일회성을 유지한다.
   */
  public CallbackResult callback(
      String provider,
      String code,
      String error,
      String state,
      String browserBinding,
      AuthPolicy policy) {
    String payload = state == null ? null : store.consumeState(state);
    if (payload == null) {
      return errorFlow("인증 확인 시간이 지났습니다. 다시 시작해 주세요.", policy);
    }
    OAuthState fields = parseState(payload);
    if (browserBinding == null
        || !browserBinding.equals(fields.binding())
        || !provider.equals(fields.provider())) {
      return errorFlow("인증 확인에 실패했습니다. 다시 시작해 주세요.", policy);
    }
    if (error != null && !error.isBlank()) {
      return errorFlow("소셜 로그인을 취소했거나 완료하지 못했습니다. 다시 시도해 주세요.", policy);
    }
    if (code == null || code.isBlank()) {
      return errorFlow("인증 확인에 실패했습니다. 다시 시작해 주세요.", policy);
    }
    ProviderUser user;
    try {
      user = providers.exchange(provider, code, fields.verifier(), fields.redirect());
    } catch (OAuthProviderUnavailableException exception) {
      return errorFlow("소셜 로그인 제공자와 통신하지 못했습니다. 다시 시도해 주세요.", policy);
    }
    return switch (fields.purpose()) {
      case "link" -> verifiedLinkCallback(user, fields.flowId(), policy);
      case "withdraw" -> reauthCallback(user, fields.flowId(), policy);
      case "login" -> loginCallback(user, policy);
      default -> errorFlow("인증 확인에 실패했습니다. 다시 시작해 주세요.", policy);
    };
  }

  private CallbackResult verifiedLinkCallback(ProviderUser user, String flowId, AuthPolicy policy) {
    OAuthFlowRecord pending = store.flow(flowId);
    if (pending == null
        || !"LINK".equals(pending.status())
        || pending.candidateAccountId() == null
        || pending.candidateAuthVersion() == null) {
      return errorFlow("계정 연결을 다시 시작해 주세요.", policy);
    }
    if (!ownsIdentity(pending.candidateAccountId(), user)) {
      return errorFlow("기존 계정의 소셜 본인 확인에 실패했습니다. 다시 시도해 주세요.", policy);
    }
    // 증명은 계정·버전에 묶고 5분만 유효하게 유지한다. 원래 source·후보 정보를 그대로 보존한다.
    OAuthFlowRecord verified = pending.verified(user.provider(), user.subject());
    store.saveFlow(verified, policy.reauthTtl());
    return new CallbackResult(verified.flowId(), null);
  }

  private CallbackResult reauthCallback(ProviderUser user, String flowId, AuthPolicy policy) {
    OAuthFlowRecord pending = store.flow(flowId);
    if (pending == null
        || !"REAUTH".equals(pending.status())
        || pending.accountId() == null
        || pending.sid() == null
        || pending.authVersion() == null) {
      return errorFlow("소셜 본인 확인을 다시 시작해 주세요.", policy);
    }
    if (!ownsIdentity(pending.accountId(), user)) {
      return errorFlow("소셜 본인 확인에 실패했습니다. 다시 시도해 주세요.", policy);
    }
    OAuthFlowRecord confirmed = pending.verified(user.provider(), user.subject());
    // 확인은 계정·로그인·인증 버전에 묶어 5분만 유효하게 한다.
    store.saveFlow(confirmed, policy.reauthTtl());
    return new CallbackResult(confirmed.flowId(), null);
  }

  private boolean ownsIdentity(long accountId, ProviderUser user) {
    return accounts.linkedIdentities(accountId).stream()
        .anyMatch(
            identity ->
                identity.provider().equals(user.provider())
                    && identity.subject().equals(user.subject()));
  }

  private CallbackResult loginCallback(ProviderUser user, AuthPolicy policy) {
    Optional<Long> linked = accounts.activeAccountIdByIdentity(user.provider(), user.subject());
    if (linked.isPresent()) {
      AccountAuthentication account =
          accounts
              .accountForAuthentication(linked.orElseThrow())
              .filter(AccountAuthentication::active)
              .orElseThrow(AuthException::unauthenticated);
      // 소셜 연결 로그인은 구매자 계정만 허용한다.
      if (!"BUYER".equals(account.role())) throw AuthException.forbidden();
      AuthService.LoginResult issued = auth.issueForAccount(account);
      OAuthFlowRecord flow = loginFlow(user, "LOGIN", null);
      saveFlow(flow, policy);
      return new CallbackResult(flow.flowId(), issued);
    }
    String normalizedEmail =
        com.mirinae.market.modules.account.business.EmailRule.normalize(user.email());
    Optional<Long> candidate =
        normalizedEmail == null
            ? Optional.empty()
            : accounts.activeAccountIdByEmail(normalizedEmail);
    if (candidate.isPresent()) {
      // 이메일 후보에는 자동 연결하지 않는다. 소유 확인 전 역할·가입 수단을 노출하지 않고 LINK 안내만 한다.
      // 증명 시점의 인증 버전을 함께 고정해 이후 password 변경·탈퇴 경합에서 과거 증명이 승격되지 않게 한다.
      long candidateId = candidate.orElseThrow();
      Long candidateVersion =
          accounts
              .accountForAuthentication(candidateId)
              .map(AccountAuthentication::authVersion)
              .orElse(null);
      OAuthFlowRecord flow = linkFlow(user, candidateId, candidateVersion, null, policy);
      return new CallbackResult(flow.flowId(), null);
    }
    // 제공자 email이 누락·형식 오류면 후보 조회 없이 가입 폼에서 보완하게 한다.
    OAuthFlowRecord flow = loginFlow(user, "SIGNUP", null);
    saveFlow(flow, policy);
    return new CallbackResult(flow.flowId(), null);
  }

  private OAuthFlowRecord linkFlow(
      ProviderUser user,
      long candidateAccountId,
      Long candidateAuthVersion,
      String message,
      AuthPolicy policy) {
    OAuthFlowRecord flow =
        OAuthFlowRecord.linkFlow(
            AuthSecrets.randomToken(),
            user.provider(),
            user.subject(),
            user.email(),
            candidateAccountId,
            candidateAuthVersion,
            null,
            null,
            false,
            message);
    saveFlow(flow, policy);
    return flow;
  }

  private OAuthFlowRecord loginFlow(ProviderUser user, String status, String message) {
    return OAuthFlowRecord.loginFlow(
        AuthSecrets.randomToken(),
        status,
        user.provider(),
        user.subject(),
        user.displayName(),
        user.email(),
        message);
  }

  private CallbackResult errorFlow(String message, AuthPolicy policy) {
    OAuthFlowRecord flow = OAuthFlowRecord.errorFlow(AuthSecrets.randomToken(), message);
    store.saveFlow(flow, policy.stateTtl());
    return new CallbackResult(flow.flowId(), null);
  }

  /** 현재 브라우저 흐름을 조회한다. 흐름 쿠키가 없거나 만료되면 ERROR 안내를 반환한다. */
  public OAuthFlowView flow(String flowId) {
    OAuthFlowRecord flow = flowId == null || flowId.isBlank() ? null : store.flow(flowId);
    if (flow == null) {
      return new OAuthFlowView("ERROR", null, null, null, false, "인증 확인 시간이 지났습니다. 다시 시작해 주세요.");
    }
    var view = flow.view();
    return new OAuthFlowView(
        view.status(),
        view.provider(),
        view.displayName(),
        view.email(),
        view.linkVerified(),
        view.message());
  }

  /** 소셜 신규 가입이다. 완료 즉시 로그인한다. 보완한 이메일이 기존 회원과 겹치면 회원을 만들지 않고 pending LINK로 전환해 409로 안내한다. */
  public SignupOutcome signup(String displayName, String email, String flowId) {
    OAuthFlowRecord flow = store.consumeFlow(flowId);
    if (flow == null || !"SIGNUP".equals(flow.status())) {
      throw AuthException.flowExpired();
    }
    String normalizedEmail = EmailRule.normalize(email);
    if (normalizedEmail == null) {
      throw AuthException.invalidInput("올바른 이메일을 입력해 주세요.");
    }
    Optional<Long> existing = accounts.activeAccountIdByEmail(normalizedEmail);
    if (existing.isPresent()) {
      // 가입을 만들지 않고 연결 화면으로 전환한다. 새 흐름을 저장해 Presentation이 새 HttpOnly 쿠키를 설정한다.
      OAuthFlowRecord link =
          OAuthFlowRecord.linkFlow(
              AuthSecrets.randomToken(),
              flow.provider(),
              flow.subject(),
              normalizedEmail,
              existing.orElseThrow(),
              accounts
                  .accountForAuthentication(existing.orElseThrow())
                  .map(AccountAuthentication::authVersion)
                  .orElse(null),
              null,
              null,
              false,
              "같은 이메일의 기존 계정이 있습니다. 계정 소유 확인 후 연결해 주세요.");
      store.saveFlow(link, linkTtl());
      return new SignupOutcome.LinkRequired(link.flowId());
    }
    AccountAuthentication created;
    try {
      created =
          accounts.registerSocialBuyer(
              displayName, normalizedEmail, flow.provider(), flow.subject());
    } catch (DuplicateAccountException exception) {
      throw AuthException.linkConflict();
    }
    // 발급 직전 활성·역할을 다시 확인해 경합으로 비활성화된 계정에 토큰을 주지 않는다.
    AccountAuthentication current =
        accounts
            .accountForAuthentication(created.id())
            .filter(AccountAuthentication::active)
            .orElseThrow(AuthException::unauthenticated);
    if (!"BUYER".equals(current.role())) throw AuthException.forbidden();
    AuthService.LoginResult issued = auth.issueForAccount(current);
    store.deleteFlow(flow.flowId());
    return new SignupOutcome.Success(issued);
  }

  /** 기존 계정 연결이다. 로컬 자격 증명 또는 기존 소셜 재인증 증명을 요구한다. */
  public AuthService.LoginResult link(
      String flowId, boolean confirm, String loginId, String password) {
    if (!confirm) {
      // 동의 실패는 proof를 소비하지 않고 다시 시도할 수 있게 안내만 한다.
      throw AuthException.invalidInput("계정 연결에 동의해 주세요.");
    }
    OAuthFlowRecord flow = store.flow(flowId);
    if (flow == null || !"LINK".equals(flow.status()) || flow.candidateAccountId() == null) {
      throw AuthException.flowExpired();
    }
    AccountAuthentication candidate =
        accounts
            .accountForAuthentication(flow.candidateAccountId())
            .orElseThrow(AuthException::forbidden);
    if (!candidate.active()) throw AuthException.forbidden();
    if (!"BUYER".equals(candidate.role())) throw AuthException.forbidden();
    if (!flow.linkVerified()) {
      // 로컬 자격 증명은 후보 계정의 현재 ID·비밀번호와 정확히 일치해야 한다.
      if (loginId == null
          || loginId.isBlank()
          || password == null
          || password.isEmpty()
          || !candidate.loginId().equals(loginId)
          || !candidate.hasLocalPassword()
          || !encoder.matches(password, candidate.passwordHash())) {
        throw AuthException.invalidCredentials();
      }
      if (flow.email() != null) {
        Optional<Long> byEmail = accounts.activeAccountIdByEmail(flow.email());
        if (byEmail.isPresent() && byEmail.orElseThrow() != candidate.id()) {
          throw AuthException.linkConflict();
        }
      }
    } else if (flow.candidateAuthVersion() == null
        || flow.candidateAuthVersion() != candidate.authVersion()) {
      // 소셜 재인증 증명은 발급 시점의 id·version에만 유효하다.
      throw AuthException.flowExpired();
    }
    if (!accounts.identityAvailable(flow.provider(), flow.subject())) {
      throw AuthException.linkConflict();
    }
    // 입력·자격 증명 검증이 끝난 뒤, DB 변경 전에 proof를 원자적으로 1회 소비한다.
    // 동시 제출이면 하나만 claim에 성공하고 나머지는 새 재인증이 필요하다.
    OAuthFlowRecord claimed = store.consumeFlow(flow.flowId());
    if (claimed == null
        || !"LINK".equals(claimed.status())
        || claimed.candidateAccountId() == null
        || !claimed.candidateAccountId().equals(flow.candidateAccountId())
        || !claimed.provider().equals(flow.provider())
        || !claimed.subject().equals(flow.subject())) {
      throw AuthException.flowExpired();
    }
    long provenVersion =
        flow.candidateAuthVersion() == null ? candidate.authVersion() : flow.candidateAuthVersion();
    try {
      accounts.connectIdentity(candidate.id(), provenVersion, flow.provider(), flow.subject());
    } catch (DuplicateAccountException exception) {
      throw AuthException.linkConflict();
    }
    // 발급 직전 현재 상태를 다시 확인한다. 증명한 버전과 다르면 password 변경·탈퇴 경합이므로 과거 증명을 새 버전으로 승격하지 않는다.
    AccountAuthentication current =
        accounts
            .accountForAuthentication(candidate.id())
            .filter(AccountAuthentication::active)
            .orElseThrow(AuthException::unauthenticated);
    if (!"BUYER".equals(current.role())) throw AuthException.forbidden();
    if (current.authVersion() != provenVersion) throw AuthException.flowExpired();
    return auth.issueForAccount(current);
  }

  /** 탈퇴 소셜 재인증 확인을 원자적으로 한 번만 소비한다. 계정·로그인·인증 버전에 묶인다. */
  public void consumeWithdrawalProof(String flowId, long accountId, String sid, long authVersion) {
    OAuthFlowRecord flow = store.consumeFlow(flowId);
    if (flow == null
        || !"REAUTH".equals(flow.status())
        || flow.accountId() == null
        || flow.authVersion() == null
        || !flow.linkVerified()) {
      throw AuthException.forbidden();
    }
    if (flow.accountId() != accountId
        || flow.authVersion() != authVersion
        || flow.sid() == null
        || !flow.sid().equals(sid)) {
      throw AuthException.forbidden();
    }
  }

  /** 탈퇴 시 제공자 연결을 해제한다. 카카오 외 제공자는 서비스 내 연결 삭제만 한다. */
  public void unlinkIdentities(long accountId) {
    for (var identity : accounts.linkedIdentities(accountId)) {
      try {
        providers.unlink(identity.provider(), identity.subject());
      } catch (OAuthProviderUnavailableException exception) {
        throw AuthException.providerError();
      }
    }
  }

  private OAuthFlowRecord saveFlow(OAuthFlowRecord flow, AuthPolicy policy) {
    store.saveFlow(flow, policy.stateTtl());
    return flow;
  }

  private static java.time.Duration linkTtl() {
    return java.time.Duration.ofMinutes(5);
  }

  /** state에 담는 요청 문맥이다. 브라우저는 이 값을 볼 수 없고 서버 Redis에만 둔다. */
  private record OAuthState(
      String provider,
      String purpose,
      String binding,
      String verifier,
      String redirect,
      String flowId) {}

  private static String statePayload(
      String provider,
      String purpose,
      String binding,
      String verifier,
      String redirectUri,
      OAuthFlowRecord pending) {
    return "provider="
        + provider
        + "&purpose="
        + purpose
        + "&binding="
        + binding
        + "&verifier="
        + verifier
        + "&redirect="
        + redirectUri
        + (pending == null ? "" : "&flowId=" + pending.flowId());
  }

  private static OAuthState parseState(String payload) {
    String provider = null;
    String purpose = null;
    String binding = null;
    String verifier = null;
    String redirect = null;
    String flowId = null;
    for (String pair : payload.split("&")) {
      int index = pair.indexOf('=');
      if (index <= 0) continue;
      String key = pair.substring(0, index);
      String value = pair.substring(index + 1);
      switch (key) {
        case "provider" -> provider = value;
        case "purpose" -> purpose = value;
        case "binding" -> binding = value;
        case "verifier" -> verifier = value;
        case "redirect" -> redirect = value;
        case "flowId" -> flowId = value;
        default -> {
          // 알 수 없는 키는 무시한다.
        }
      }
    }
    return new OAuthState(provider, purpose, binding, verifier, redirect, flowId);
  }

  /** 흐름 시작 결과다. 새로 만든 브라우저 바인딩 쿠키 값만 함께 전달한다. */
  public record StartResult(String authorizationUrl, String browserBinding, String flowId) {}

  /** 콜백 결과다. LOGIN이면 refresh를 쿠키로 전달한다. */
  public record CallbackResult(String flowId, AuthService.LoginResult login) {}
}
