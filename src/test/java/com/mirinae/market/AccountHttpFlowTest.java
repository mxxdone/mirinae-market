package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfig.class)
class AccountHttpFlowTest {
  @Value("${local.server.port}")
  private int port;

  @Autowired private JdbcTemplate jdbc;
  @Autowired private PasswordEncoder encoder;
  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;

  private static String uniqueId() {
    return "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  @Test
  void signupLoginCurrentAndLogoutUseRealDatabaseAndRotatedSession() throws Exception {
    String loginId = uniqueId();
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
      assertThat(session.get("/api/seller/stores/1").statusCode()).isEqualTo(401);
      session.refreshCsrf();
      String oldSession = session.sessionId();
      // 로그인 시 새 세션 쿠키에서도 같은 보안 속성이 유지되어야 한다.
      HttpResponse<String> signup = session.signup(loginId, " Mixed" + loginId + "@Example.com ");
      assertThat(signup.statusCode()).isEqualTo(201);
      assertThat(signup.body()).contains("BUYER").doesNotContain("password", "email");
      assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
      String hash =
          jdbc.queryForObject(
              "SELECT password_hash FROM accounts WHERE login_id = ?", String.class, loginId);
      assertThat(hash).isNotEqualTo("Pass1234!");
      assertThat(encoder.matches("Pass1234!", hash)).isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT email FROM accounts WHERE login_id = ?", String.class, loginId))
          .isEqualTo("mixed" + loginId + "@example.com");
      HttpResponse<String> loginResponse = session.login(loginId, "Pass1234!");
      assertThat(loginResponse.statusCode()).isEqualTo(200);
      assertThat(loginResponse.headers().allValues("set-cookie").toString())
          .contains("HttpOnly", "SameSite=Lax")
          .doesNotContain("Secure");
      assertThat(session.sessionId()).isNotEmpty().isNotEqualTo(oldSession);
      assertThat(session.get("/api/auth/me").body())
          .contains(loginId, "BUYER")
          .doesNotContain(hash);
      assertThat(session.get("/api/seller/stores/1").statusCode()).isEqualTo(403);
      // 로그인 전 토큰은 로그인 성공 후 폐기되어야 한다.
      assertThat(
              session
                  .post("/api/auth/logout", "", "application/x-www-form-urlencoded", true)
                  .statusCode())
          .isEqualTo(403);
      session.refreshCsrf();
      String loggedInCookie = session.sessionId();
      HttpResponse<String> logout =
          session.post("/api/auth/logout", "", "application/x-www-form-urlencoded", true);
      assertThat(logout.statusCode()).isEqualTo(204);
      assertThat(
              logout.headers().allValues("set-cookie").stream()
                  .flatMap(header -> java.net.HttpCookie.parse(header).stream())
                  .anyMatch(
                      cookie -> cookie.getName().equals("JSESSIONID") && cookie.getMaxAge() == 0))
          .isTrue();
      assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
      try (var oldClient = java.net.http.HttpClient.newHttpClient()) {
        var request =
            java.net.http.HttpRequest.newBuilder(
                    java.net.URI.create("http://localhost:" + port + "/api/auth/me"))
                .header("Cookie", "JSESSIONID=" + loggedInCookie)
                .GET()
                .build();
        assertThat(
                oldClient
                    .send(request, java.net.http.HttpResponse.BodyHandlers.ofString())
                    .statusCode())
            .isEqualTo(401);
      }
    }
  }

  @Test
  void csrfInvalidInputAndDuplicateAccountsAreRejectedWithoutWrites() throws Exception {
    String loginId = uniqueId();
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      assertThat(session.post("/api/accounts", "{}", "application/json", false).statusCode())
          .isEqualTo(403);
      assertThat(
              session
                  .post(
                      "/api/auth/login",
                      "loginId=x&password=x",
                      "application/x-www-form-urlencoded",
                      false)
                  .statusCode())
          .isEqualTo(403);
      assertThat(
              session
                  .post("/api/auth/logout", "", "application/x-www-form-urlencoded", false)
                  .statusCode())
          .isEqualTo(403);
      session.refreshCsrf();
      assertThat(session.post("/api/accounts", "{}", "application/json", true).statusCode())
          .isEqualTo(400);
      assertThat(session.post("/api/accounts", "{", "application/json", true).statusCode())
          .isEqualTo(400);
      assertThat(session.signup("abcd", "bad@example.com").statusCode()).isEqualTo(400);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM accounts WHERE login_id = 'abcd'", Long.class))
          .isZero();
      assertThat(session.signup(loginId, loginId + "@example.com").statusCode()).isEqualTo(201);
      assertThat(session.signup(loginId, uniqueId() + "@example.com").statusCode()).isEqualTo(409);
      assertThat(
              session
                  .signup(
                      uniqueId(),
                      " " + loginId.toUpperCase(java.util.Locale.ROOT) + "@EXAMPLE.COM ")
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM accounts WHERE login_id = ?", Long.class, loginId))
          .isEqualTo(1L);
    }
  }

  @Test
  void wrongIdAndPasswordShareTheSameFailureContract() throws Exception {
    String loginId = uniqueId();
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      session.refreshCsrf();
      assertThat(session.signup(loginId, loginId + "@example.com").statusCode()).isEqualTo(201);
      HttpResponse<String> unknownId = session.login("does_not_exist", "Pass1234!");
      HttpResponse<String> wrongPassword = session.login(loginId, "Wrong1234!");
      assertThat(unknownId.statusCode()).isEqualTo(401);
      assertThat(wrongPassword.statusCode()).isEqualTo(401);
      assertThat(unknownId.body()).isEqualTo(wrongPassword.body()).contains("INVALID_CREDENTIALS");
      assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }
  }

  @Test
  // 웹 컨테이너 밖의 테스트 클라이언트만 병렬 실행해 실제 DB 고유 제약의 경쟁을 검증한다.
  @SuppressWarnings("PMD.DoNotUseThreads")
  void concurrentDuplicateIdOrEmailPersistsOnlyOneAccount() throws Exception {
    for (boolean sameId : List.of(true, false)) {
      String firstId = uniqueId();
      String secondId = sameId ? firstId : uniqueId();
      String email = firstId + "@example.com";
      CyclicBarrier barrier = new CyclicBarrier(2);
      Callable<Integer> first = () -> competingSignup(firstId, email, barrier);
      Callable<Integer> second =
          () -> competingSignup(secondId, sameId ? secondId + "2@example.com" : email, barrier);
      try (var executor = Executors.newFixedThreadPool(2)) {
        var firstResult = executor.submit(first);
        var secondResult = executor.submit(second);
        assertThat(
                List.of(
                    firstResult.get(30, java.util.concurrent.TimeUnit.SECONDS),
                    secondResult.get(30, java.util.concurrent.TimeUnit.SECONDS)))
            .containsExactlyInAnyOrder(201, 409);
      }
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM accounts WHERE login_id IN (?, ?)",
                  Long.class,
                  firstId,
                  secondId))
          .isEqualTo(1L);
    }
  }

  private int competingSignup(String loginId, String email, CyclicBarrier barrier)
      throws Exception {
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      session.refreshCsrf();
      barrier.await(20, java.util.concurrent.TimeUnit.SECONDS);
      return session.signup(loginId, email).statusCode();
    }
  }

  @Test
  void sellersCanReadOnlyTheirOwnStore() throws Exception {
    String sellerId = uniqueId();
    AccountView seller =
        accounts.ensureDemoAccount(
            sellerId, "Pass1234!", "판매자A", sellerId + "@example.com", "SELLER");
    String otherId = uniqueId();
    AccountView other =
        accounts.ensureDemoAccount(
            otherId, "Pass1234!", "판매자B", otherId + "@example.com", "SELLER");
    long ownStore = stores.ensureDemoStore(seller.loginId(), "시장" + sellerId, "매장A").id();
    long otherStore = stores.ensureDemoStore(other.loginId(), "시장" + otherId, "매장B").id();
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      session.refreshCsrf();
      assertThat(session.login(sellerId, "Pass1234!").statusCode()).isEqualTo(200);
      HttpResponse<String> own = session.get("/api/seller/stores/" + ownStore);
      assertThat(own.statusCode()).isEqualTo(200);
      assertThat(own.body()).contains("매장A");
      HttpResponse<String> foreign = session.get("/api/seller/stores/" + otherStore);
      assertThat(foreign.statusCode()).isEqualTo(403);
      assertThat(foreign.body()).doesNotContain("매장B");
      assertThat(session.get("/api/seller/stores/99999999").statusCode()).isEqualTo(403);
    }
  }

  @Test
  void clientCannotChooseSellerRoleAndBuyerCannotOwnDemoStore() throws Exception {
    String loginId = uniqueId();
    try (HttpSessionClient session = new HttpSessionClient(port)) {
      session.refreshCsrf();
      String request =
          "{\"loginId\":\""
              + loginId
              + "\",\"password\":\"Pass1234!\",\"displayName\":\"시장손님\",\"email\":\""
              + loginId
              + "@example.com\",\"role\":\"SELLER\"}";
      HttpResponse<String> response =
          session.post("/api/accounts", request, "application/json", true);
      assertThat(response.statusCode()).isEqualTo(201);
      assertThat(session.json(response).get("role").asString()).isEqualTo("BUYER");
      org.assertj.core.api.Assertions.assertThatThrownBy(
              () -> stores.ensureDemoStore(loginId, "시장", "매장"))
          .isInstanceOf(com.mirinae.market.modules.store.business.StoreForbiddenException.class);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM stores WHERE owner_account_id = ?",
                  Long.class,
                  accounts.current(loginId).id()))
          .isZero();
    }
  }

  @Test
  void defaultProfileMigratesWithoutDemoCredentials() {
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE success = true AND version = '1'",
                Long.class))
        .isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM accounts WHERE login_id LIKE 'demo_%'", Long.class))
        .isZero();
  }
}
