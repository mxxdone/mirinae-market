package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PostgresTestConfig.class)
@ActiveProfiles("demo")
class DemoDataIntegrationTest {
  @Autowired private ApplicationRunner demoData;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private AccountService accounts;

  @Value("${local.server.port}")
  private int port;

  @Test
  void demoInitializationIsIdempotentAndItsAccountsCanLogin() throws Exception {
    demoData.run(new DefaultApplicationArguments());
    assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Long.class)).isEqualTo(3L);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM markets", Long.class)).isEqualTo(2L);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM stores", Long.class)).isEqualTo(2L);
    for (String id : java.util.List.of("demo_buyer", "demo_seller_a", "demo_seller_b")) {
      try (HttpSessionClient session = new HttpSessionClient(port)) {
        session.refreshCsrf();
        assertThat(session.login(id, "Demo1234!").statusCode()).isEqualTo(200);
        assertThat(session.get("/api/auth/me").body()).contains(id);
      }
    }
  }

  @Test
  void demoCollisionCannotPromoteOrOverwriteAnExistingBuyer() {
    assertThatThrownBy(
            () ->
                accounts.ensureDemoAccount(
                    "demo_buyer", "Other1234!", "데모구매자", "buyer@example.com", "SELLER"))
        .isInstanceOf(IllegalStateException.class);
    assertThat(accounts.current("demo_buyer").role()).isEqualTo("BUYER");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Long.class)).isEqualTo(3L);
  }
}
