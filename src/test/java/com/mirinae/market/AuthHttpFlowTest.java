package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 실제 HTTP·PostgreSQL·Redis에서 JWT·refresh 회전·로그아웃·소셜 가입/연결/탈퇴 경계를 검증한다. 제공자 HTTP만 test-only 대역을 사용하며
 * 실제 제공자 검증과 구분한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestConfig.class, RedisTestConfig.class, FakeOAuthProviderConfig.class})
class AuthHttpFlowTest {
  private static final String PASSWORD = "Pass1234!";

  @Value("${local.server.port}")
  private int port;

  @Autowired private JdbcTemplate jdbc;
  @Autowired private FakeOAuthProviderConfig.FakeOAuthProvider provider;
  @Autowired private AccountService accounts;

  private static String uniqueId() {
    return "a" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  private String signup(String loginId, String email) throws Exception {
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      assertThat(client.signup(loginId, email).statusCode()).isEqualTo(201);
    }
    return loginId;
  }

  private HttpSessionClient loggedIn(String loginId) throws Exception {
    HttpSessionClient client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(client.login(loginId, PASSWORD).statusCode()).isEqualTo(200);
    return client;
  }

  @Test
  void refreshRotatesOnceAndOldTokenReuseRevokesTheLogin() throws Exception {
    String loginId = signup(uniqueId(), uniqueId() + "@example.com");
    try (HttpSessionClient client = loggedIn(loginId)) {
      String firstRefresh = client.refreshCookie();
      assertThat(client.refresh().statusCode()).isEqualTo(200);
      String secondRefresh = client.refreshCookie();
      assertThat(secondRefresh).isNotEqualTo(firstRefresh);

      // 이미 사용한 refresh를 다시 보내면 해당 로그인 전체가 폐기된다.
      var replay = client.replayRefresh(firstRefresh);
      assertThat(replay.statusCode()).isEqualTo(401);
      // 재사용 탐지 후 새 refresh도 더 이상 유효하지 않다.
      assertThat(client.refresh().statusCode()).isEqualTo(401);
    }
  }

  @Test
  void logoutWithoutAccessTokenStillRevokesViaRefreshCookie() throws Exception {
    String loginId = signup(uniqueId(), uniqueId() + "@example.com");
    try (HttpSessionClient client = loggedIn(loginId)) {
      String issuedRefresh = client.refreshCookie();
      // access를 지워도 refresh 쿠키로 로그아웃할 수 있어야 한다.
      client.clearAccessToken();
      client.refreshCsrf();
      assertThat(client.logout().statusCode()).isEqualTo(204);
      assertThat(client.refresh().statusCode()).isEqualTo(401);
      assertThat(issuedRefresh).isNotBlank();
    }
  }

  @Test
  void logoutIsIdempotentAfterRefreshAlreadyGone() throws Exception {
    String loginId = signup(uniqueId(), uniqueId() + "@example.com");
    try (HttpSessionClient client = loggedIn(loginId)) {
      client.refreshCsrf();
      assertThat(client.logout().statusCode()).isEqualTo(204);
      // 이미 만료·유실된 로그인도 쿠키를 지우고 204로 응답한다.
      assertThat(client.logout().statusCode()).isEqualTo(204);
    }
  }

  @Test
  void passwordChangeInvalidatesEveryExistingToken() throws Exception {
    String loginId = uniqueId();
    accounts.ensureDemoAccount(loginId, PASSWORD, "판매자", loginId + "@example.com", "SELLER");
    // 첫 비밀번호 변경 제한을 해제해 일반 보호 요청을 허용한다.
    jdbc.update("UPDATE accounts SET password_change_required=false WHERE login_id=?", loginId);
    try (HttpSessionClient client = loggedIn(loginId);
        HttpSessionClient secondDevice = loggedIn(loginId)) {
      client.refreshCsrf();
      HttpResponse<String> changed =
          client.put(
              "/api/seller/password",
              "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"NewPass1234!\"}",
              true);
      assertThat(changed.statusCode()).isEqualTo(200);
      // 비밀번호 변경은 인증 버전을 올려 이 기기와 다른 기기의 기존 토큰을 모두 거절한다.
      assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(401);
      assertThat(secondDevice.get("/api/auth/me").statusCode()).isEqualTo(401);
      assertThat(client.refresh().statusCode()).isEqualTo(401);
      assertThat(secondDevice.refresh().statusCode()).isEqualTo(401);
    }
  }

  @Test
  void socialSignupCreatesPasswordlessBuyerAndLogsInImmediately() throws Exception {
    String email = uniqueId() + "@example.com";
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    String code = provider.issueCode("kakao", subject, "소셜손님", email);
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      // login 목적은 새 흐름을 만들지 않으므로 flow 쿠키가 비어 있는 것이 정상이다. state는 서버 Redis에만 있다.
      startFlow(client, "kakao", "login");
      HttpResponse<String> callback = callback(client, "kakao", code);
      assertThat(callback.statusCode()).isEqualTo(302);
      assertThat(callback.headers().firstValue("Location")).contains("/#oauth");

      HttpResponse<String> flow = flow(client);
      assertThat(flow.statusCode()).isEqualTo(200);
      assertThat(flow.body()).contains("SIGNUP").contains("소셜손님");

      client.refreshCsrf();
      HttpResponse<String> signup =
          client.post(
              "/api/auth/oauth/signup",
              "{\"displayName\":\"소셜손님\",\"email\":\"" + email + "\"}",
              "application/json",
              true);
      assertThat(signup.statusCode()).isEqualTo(200);
      assertThat(signup.body()).contains("accessToken", "authenticated");
      client.captureAccess(signup);
      assertThat(signup.headers().allValues("set-cookie").toString()).contains("MIRINAE_REFRESH");
      assertThat(client.get("/api/auth/me").body())
          .contains("hasLocalPassword")
          .contains("linkedProviders")
          .contains("kakao");

      var row = jdbc.queryForMap("SELECT password_hash,role FROM accounts WHERE email=?", email);
      assertThat(row.get("password_hash")).isNull();
      assertThat(row.get("role")).isEqualTo("BUYER");
      // 소셜 전용 계정은 로컬 비밀번호 로그인이 불가능하다.
      try (HttpSessionClient local = new HttpSessionClient(port)) {
        local.refreshCsrf();
        assertThat(local.login(loginIdFor(email), PASSWORD).statusCode()).isEqualTo(401);
      }
    }
  }

  @Test
  void existingEmailRequiresLinkWithLocalCredentialsAndPreservesAccount() throws Exception {
    String loginId = signup(uniqueId(), uniqueId() + "@example.com");
    String email =
        jdbc.queryForObject("SELECT email FROM accounts WHERE login_id=?", String.class, loginId);
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      String code = provider.issueCode("google", subject, "연결손님", email);
      startFlow(client, "google", "login");
      assertThat(callback(client, "google", code).statusCode()).isEqualTo(302);
      assertThat(flow(client).body()).contains("LINK");

      client.refreshCsrf();
      HttpResponse<String> linked =
          client.post(
              "/api/auth/oauth/link",
              "{\"confirm\":true,\"loginId\":\""
                  + loginId
                  + "\",\"password\":\""
                  + PASSWORD
                  + "\"}",
              "application/json",
              true);
      assertThat(linked.statusCode()).isEqualTo(200);
      long accountId =
          jdbc.queryForObject("SELECT id FROM accounts WHERE login_id=?", Long.class, loginId);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM social_identities WHERE account_id=? AND provider='google'",
                  Long.class,
                  accountId))
          .isEqualTo(1L);
      // 기존 내부 id와 주문 주체는 그대로다.
      assertThat(
              jdbc.queryForObject("SELECT id FROM accounts WHERE login_id=?", Long.class, loginId))
          .isEqualTo(accountId);
    }
  }

  @Test
  void linkRejectsWrongLocalPasswordWithoutChangingIdentity() throws Exception {
    String loginId = signup(uniqueId(), uniqueId() + "@example.com");
    String email =
        jdbc.queryForObject("SELECT email FROM accounts WHERE login_id=?", String.class, loginId);
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      String code = provider.issueCode("kakao", subject, "연결손님", email);
      startFlow(client, "kakao", "login");
      callback(client, "kakao", code);
      client.refreshCsrf();
      HttpResponse<String> linked =
          client.post(
              "/api/auth/oauth/link",
              "{\"confirm\":true,\"loginId\":\"" + loginId + "\",\"password\":\"Wrong1234!\"}",
              "application/json",
              true);
      assertThat(linked.statusCode()).isEqualTo(401);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM social_identities WHERE provider='kakao' AND subject=?",
                  Long.class,
                  subject))
          .isZero();
    }
  }

  @Test
  void socialWithdrawalRequiresReauthAndUnlinksKakaoBeforeDeactivation() throws Exception {
    String email = uniqueId() + "@example.com";
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      String code = provider.issueCode("kakao", subject, "탈퇴손님", email);
      startFlow(client, "kakao", "login");
      callback(client, "kakao", code);
      client.refreshCsrf();
      var socialSignup =
          client.post(
              "/api/auth/oauth/signup",
              "{\"displayName\":\"탈퇴손님\",\"email\":\"" + email + "\"}",
              "application/json",
              true);
      assertThat(socialSignup.statusCode()).isEqualTo(200);
      client.captureAccess(socialSignup);

      // 재인증 없이는 소셜 전용 계정 탈퇴가 거부된다.
      client.refreshCsrf();
      HttpResponse<String> withoutProof =
          client.post("/api/buyer/withdrawal", "{}", "application/json", true);
      assertThat(withoutProof.statusCode()).isEqualTo(403);

      // 탈퇴 재인증 흐름을 시작하고 제공자 재인증을 완료한다.
      client.refreshCsrf();
      String reauthCode = provider.issueCode("kakao", subject, "탈퇴손님", email);
      startFlow(client, "kakao", "withdraw");
      callback(client, "kakao", reauthCode);
      assertThat(flow(client).body()).contains("REAUTH");
      HttpResponse<String> withdrawn =
          client.post("/api/buyer/withdrawal", "{}", "application/json", true);
      assertThat(withdrawn.statusCode()).isEqualTo(204);
      // 카카오 연결 해제가 로컬 비활성화보다 먼저 성공했다.
      assertThat(provider.unlinkCount(subject)).isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT withdrawn_at FROM accounts WHERE email LIKE '%@example.invalid' AND withdrawn_at IS NOT NULL ORDER BY id DESC LIMIT 1",
                  java.sql.Timestamp.class))
          .isNotNull();
      assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(401);
    }
  }

  @Test
  void providerUnlinkFailureKeepsLocalAccountAndTradeState() throws Exception {
    String email = uniqueId() + "@example.com";
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      String code = provider.issueCode("kakao", subject, "장애손님", email);
      startFlow(client, "kakao", "login");
      callback(client, "kakao", code);
      client.refreshCsrf();
      var signup =
          client.post(
              "/api/auth/oauth/signup",
              "{\"displayName\":\"장애손님\",\"email\":\"" + email + "\"}",
              "application/json",
              true);
      assertThat(signup.statusCode()).isEqualTo(200);
      client.captureAccess(signup);
      long accountId =
          jdbc.queryForObject("SELECT id FROM accounts WHERE email=?", Long.class, email);

      client.refreshCsrf();
      String reauthCode = provider.issueCode("kakao", subject, "장애손님", email);
      startFlow(client, "kakao", "withdraw");
      callback(client, "kakao", reauthCode);

      provider.failNextUnlink(subject);
      client.refreshCsrf();
      HttpResponse<String> failed =
          client.post("/api/buyer/withdrawal", "{}", "application/json", true);
      assertThat(failed.statusCode()).isEqualTo(502);
      assertThat(failed.body()).contains("OAUTH_PROVIDER_ERROR");
      assertThat(
              jdbc.queryForObject(
                  "SELECT withdrawn_at FROM accounts WHERE id=?",
                  java.sql.Timestamp.class,
                  accountId))
          .isNull();
      assertThat(client.get("/api/auth/me").statusCode()).isEqualTo(200);
    }
  }

  @Test
  void flowWithoutCookieReturnsErrorInsteadOfUnauthorized() throws Exception {
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      HttpResponse<String> flow = flow(client);
      assertThat(flow.statusCode()).isEqualTo(200);
      assertThat(flow.body()).contains("ERROR").contains("인증 확인 시간이 지났습니다");
    }
  }

  @Test
  void configuredProvidersAreListed() throws Exception {
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      assertThat(client.get("/api/auth/oauth/providers").body()).contains("kakao", "google");
    }
  }

  @Test
  void signupWithExistingEmailReturns409WithNewFlowCookieForLinkScreen() throws Exception {
    String existingLoginId = signup(uniqueId(), uniqueId() + "@example.com");
    String existingEmail =
        jdbc.queryForObject(
            "SELECT email FROM accounts WHERE login_id=?", String.class, existingLoginId);
    String subject = Long.toString(Math.abs(UUID.randomUUID().getMostSignificantBits()));
    try (HttpSessionClient client = new HttpSessionClient(port)) {
      client.refreshCsrf();
      // 미연결 사용자이면서 아직 계정이 없는 이메일이면 SIGNUP 흐름이 만들어진다.
      String code = provider.issueCode("kakao", subject, "중복손님", uniqueId() + "@example.com");
      startFlow(client, "kakao", "login");
      callback(client, "kakao", code);
      assertThat(flow(client).body()).contains("SIGNUP");

      // 가입 화면에서 기존 회원의 이메일로 보완해 제출하면 회원을 만들지 않고 409 LINK_REQUIRED + 새 흐름 쿠키를 준다.
      client.refreshCsrf();
      HttpResponse<String> signup =
          client.post(
              "/api/auth/oauth/signup",
              "{\"displayName\":\"중복손님\",\"email\":\"" + existingEmail + "\"}",
              "application/json",
              true);
      assertThat(signup.statusCode()).isEqualTo(409);
      assertThat(client.json(signup).get("code").asString()).isEqualTo("LINK_REQUIRED");
      String flowCookie = client.flowCookie();
      assertThat(flowCookie).isNotBlank();
      assertThat(signup.headers().allValues("set-cookie").toString())
          .contains("MIRINAE_OAUTH_FLOW", "HttpOnly", "SameSite=Lax");

      // 컨트롤러가 설정한 새 흐름 쿠키로 flow GET이 연결 화면 상태를 돌려준다.
      HttpResponse<String> refreshed = flow(client);
      assertThat(refreshed.statusCode()).isEqualTo(200);
      assertThat(refreshed.body()).contains("LINK").doesNotContain(existingLoginId);
      assertThat(refreshed.body()).doesNotContain(existingEmail);

      // 새 회원은 만들어지지 않았다.
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM accounts WHERE email=?", Long.class, existingEmail))
          .isEqualTo(1L);
    }
  }

  private String loginIdFor(String email) {
    return jdbc.queryForObject("SELECT login_id FROM accounts WHERE email=?", String.class, email);
  }

  private String startFlow(HttpSessionClient client, String providerName, String purpose)
      throws Exception {
    HttpResponse<String> started =
        client.post(
            "/api/auth/oauth/" + providerName + "/start",
            "{\"purpose\":\"" + purpose + "\"}",
            "application/json",
            true);
    assertThat(started.statusCode()).isEqualTo(200);
    assertThat(started.body()).contains("authorizationUrl");
    String url = client.json(started).get("authorizationUrl").asString();
    java.util.regex.Matcher matcher =
        java.util.regex.Pattern.compile("[?&]state=([^&]+)").matcher(url);
    assertThat(matcher.find()).isTrue();
    lastState = URLDecoder.decode(matcher.group(1), StandardCharsets.UTF_8);
    return client.flowCookie();
  }

  private HttpResponse<String> callback(HttpSessionClient client, String providerName, String code)
      throws Exception {
    return client.get(
        "/api/auth/oauth/"
            + providerName
            + "/callback?code="
            + URLEncoder.encode(code, StandardCharsets.UTF_8)
            + "&state="
            + URLEncoder.encode(lastState, StandardCharsets.UTF_8));
  }

  private HttpResponse<String> flow(HttpSessionClient client) throws Exception {
    return client.get("/api/auth/oauth/flow");
  }

  private String lastState;
}
