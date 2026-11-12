package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.RedisTestConfig;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

class DemoRestartIntegrationTest {
  @Test
  void samePostgresSurvivesActualApplicationRestartAndCookieSettingsAreApplied() throws Exception {
    try (PostgreSQLContainer database = new PostgreSQLContainer("postgres:17.10")) {
      database.start();
      for (boolean secure : java.util.List.of(false, true)) {
        // 컨테이너는 유지하고 서버·인증 상태·JPA를 실제 종료한 뒤 같은 DB·Redis로 다시 시작한다.
        try (ConfigurableApplicationContext context =
            new SpringApplicationBuilder(MirinaeMarketApplication.class)
                .profiles("demo")
                .run(
                    "--server.port=0",
                    "--spring.datasource.url=" + database.getJdbcUrl(),
                    "--spring.datasource.username=" + database.getUsername(),
                    "--spring.datasource.password=" + database.getPassword(),
                    "--spring.data.redis.host=" + RedisTestConfig.host(),
                    "--spring.data.redis.port=" + RedisTestConfig.port(),
                    "--auth.cookie.secure=" + secure)) {
          JdbcTemplate jdbc = context.getBean(JdbcTemplate.class);
          assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Long.class))
              .isEqualTo(3L);
          assertThat(jdbc.queryForObject("SELECT count(*) FROM markets", Long.class)).isEqualTo(2L);
          assertThat(jdbc.queryForObject("SELECT count(*) FROM stores", Long.class)).isEqualTo(2L);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM flyway_schema_history WHERE version = '1' AND success",
                      Long.class))
              .isEqualTo(1L);
          int port = ((WebServerApplicationContext) context).getWebServer().getPort();
          try (HttpSessionClient session = new HttpSessionClient(port)) {
            HttpResponse<String> token = session.get("/api/auth/csrf");
            assertThat(token.statusCode()).isEqualTo(200);
            String setCookie = token.headers().allValues("set-cookie").toString();
            assertThat(setCookie).contains("MIRINAE_CSRF=", "HttpOnly", "SameSite=Lax");
            assertThat(setCookie.contains("Secure")).isEqualTo(secure);
            if (!secure) {
              session.refreshCsrf();
              assertThat(session.login("demo_buyer", "Demo1234!").statusCode()).isEqualTo(200);
              assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);
              // URL에 세션·토큰 식별자를 붙이지 않는다.
              try (HttpClient withoutAuthorization = HttpClient.newHttpClient()) {
                HttpRequest request =
                    HttpRequest.newBuilder(
                            URI.create(
                                "http://localhost:"
                                    + port
                                    + "/api/auth/me;jsessionid="
                                    + session.refreshCookie()))
                        .GET()
                        .build();
                assertThat(
                        withoutAuthorization
                            .send(request, HttpResponse.BodyHandlers.ofString())
                            .statusCode())
                    .isEqualTo(400);
              }
            }
          }
        }
      }
    }
  }
}
