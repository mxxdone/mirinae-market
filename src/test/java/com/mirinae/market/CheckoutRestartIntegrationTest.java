package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

class CheckoutRestartIntegrationTest {
  @Test
  void confirmedAndPendingResultsSurviveActualServerRestart() throws Exception {
    try (var database = new PostgreSQLContainer("postgres:17.10")) {
      database.start();
      long offerId = 0;
      long delayedVersion = 0;
      long checkoutId = 0;
      for (int round = 0; round < 2; round++) {
        try (ConfigurableApplicationContext context =
            new SpringApplicationBuilder(MirinaeMarketApplication.class)
                .profiles("e2e")
                .run(
                    "--server.port=0",
                    "--e2e.fixed-instant="
                        + (round == 0 ? "2026-10-13T03:00:00Z" : "2026-10-13T03:00:04Z"),
                    "--spring.datasource.url=" + database.getJdbcUrl(),
                    "--spring.datasource.username=" + database.getUsername(),
                    "--spring.datasource.password=" + database.getPassword())) {
          var jdbc = context.getBean(JdbcTemplate.class);
          int port = ((WebServerApplicationContext) context).getWebServer().getPort();
          if (round == 0) {
            var accounts = context.getBean(AccountService.class);
            accounts.ensureDemoAccount(
                "restart_buyer", "Pass1234!", "구매자", "restart_buyer@example.com", "BUYER");
            accounts.ensureDemoAccount(
                "restart_seller", "Pass1234!", "판매자", "restart_seller@example.com", "SELLER");
            var store =
                context
                    .getBean(StoreService.class)
                    .ensureDemoStore("restart_seller", "재기동시장", "재기동매장");
            jdbc.update(
                "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00')",
                store.id());
            long product =
                jdbc.queryForObject(
                    "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,'재기동사과','COUNT',1) RETURNING id",
                    Long.class,
                    store.id());
            offerId =
                jdbc.queryForObject(
                    "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',1000,10) RETURNING id",
                    Long.class,
                    store.id(),
                    product);
            try (var client = new HttpSessionClient(port)) {
              login(client);
              String cartBody =
                  new tools.jackson.databind.json.JsonMapper()
                      .writeValueAsString(
                          java.util.Map.of("marketId", store.marketId(), "quantity", 2));
              var cart =
                  client.json(client.put("/api/buyer/cart/items/" + offerId, cartBody, true));
              var lost =
                  client.post(
                      "/api/buyer/checkouts",
                      body("restart-lost", cart.get("version").asLong(), "LOST_RESPONSE"),
                      "application/json",
                      true);
              assertThat(lost.statusCode()).isEqualTo(503);
              checkoutId =
                  client.json(client.get("/api/buyer/checkouts/restart-lost")).get("id").asLong();
              var next =
                  client.json(client.put("/api/buyer/cart/items/" + offerId, cartBody, true));
              delayedVersion = next.get("version").asLong();
              var pending =
                  client.json(
                      client.post(
                          "/api/buyer/checkouts",
                          body("restart-delay", delayedVersion, "DELAY"),
                          "application/json",
                          true));
              assertThat(pending.get("status").asString()).isEqualTo("PENDING");
            }
          } else {
            try (var client = new HttpSessionClient(port)) {
              login(client);
              var original = client.json(client.get("/api/buyer/checkouts/restart-lost"));
              assertThat(original.get("id").asLong()).isEqualTo(checkoutId);
              assertThat(original.get("status").asString()).isEqualTo("CONFIRMED");
              org.awaitility.Awaitility.await()
                  .atMost(java.time.Duration.ofSeconds(5))
                  .untilAsserted(
                      () ->
                          assertThat(
                                  jdbc.queryForObject(
                                      "SELECT status FROM checkouts WHERE request_key='restart-delay'",
                                      String.class))
                              .isEqualTo("CONFIRMED"));
              var retried =
                  client.json(
                      client.post(
                          "/api/buyer/checkouts",
                          body("restart-delay", delayedVersion, "DELAY"),
                          "application/json",
                          true));
              assertThat(retried.get("status").asString()).isEqualTo("CONFIRMED");
              assertThat(
                      jdbc.queryForObject(
                          "SELECT online_quantity FROM daily_offers WHERE id=?",
                          Integer.class,
                          offerId))
                  .isEqualTo(6);
              assertThat(
                      jdbc.queryForObject(
                          "SELECT count(*) FROM checkouts WHERE status='CONFIRMED'", Long.class))
                  .isEqualTo(2);
            }
          }
        }
      }
    }
  }

  private static void login(HttpSessionClient client) throws Exception {
    client.refreshCsrf();
    assertThat(client.login("restart_buyer", "Pass1234!").statusCode()).isEqualTo(200);
    client.refreshCsrf();
  }

  private static String body(String key, long version, String mode) {
    return new tools.jackson.databind.json.JsonMapper()
        .writeValueAsString(
            java.util.Map.of("requestKey", key, "cartVersion", version, "mode", mode));
  }
}
