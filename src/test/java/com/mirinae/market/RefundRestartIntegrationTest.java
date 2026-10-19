package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.checkout.business.FulfillmentService;
import com.mirinae.market.modules.checkout.business.RefundService;
import com.mirinae.market.modules.store.business.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

class RefundRestartIntegrationTest {
  @Test
  void lostProviderResponseRecoversAfterActualApplicationRestartWithoutRepayment() {
    try (var database = new PostgreSQLContainer("postgres:17.10")) {
      database.start();
      long refund = 0;
      for (int round = 0; round < 2; round++) {
        try (ConfigurableApplicationContext context =
            new SpringApplicationBuilder(MirinaeMarketApplication.class)
                .profiles("e2e")
                .run(
                    "--server.port=0",
                    "--e2e.fixed-instant="
                        + (round == 0 ? "2026-10-13T03:00:00Z" : "2026-10-13T03:00:31Z"),
                    "--spring.datasource.url=" + database.getJdbcUrl(),
                    "--spring.datasource.username=" + database.getUsername(),
                    "--spring.datasource.password=" + database.getPassword(),
                    "--mirinae.refund.mode=LOST_RESPONSE",
                    "--mirinae.refund.recovery.enabled=false")) {
          var jdbc = context.getBean(JdbcTemplate.class);
          var refunds = context.getBean(RefundService.class);
          if (round == 0) {
            var accounts = context.getBean(AccountService.class);
            accounts.ensureDemoAccount(
                "refund_restart_b", "Pass1234!", "구매자", "refund-b@example.com", "BUYER");
            accounts.ensureDemoAccount(
                "refund_restart_s", "Pass1234!", "판매자", "refund-s@example.com", "SELLER");
            var store =
                context
                    .getBean(StoreService.class)
                    .ensureDemoStore("refund_restart_s", "환불재기동시장", "환불재기동매장");
            jdbc.update(
                "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00')",
                store.id());
            long product =
                jdbc.queryForObject(
                    "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,'재기동사과','COUNT',1) RETURNING id",
                    Long.class,
                    store.id());
            long offer =
                jdbc.queryForObject(
                    "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',1000,10) RETURNING id",
                    Long.class,
                    store.id(),
                    product);
            var checkout = context.getBean(CheckoutService.class);
            var cart = checkout.put("refund_restart_b", store.marketId(), offer, 2);
            long order =
                checkout
                    .start("refund_restart_b", "restart-purchase", cart.version(), "SUCCESS")
                    .checkout()
                    .storeOrders()
                    .getFirst()
                    .id();
            context
                .getBean(FulfillmentService.class)
                .cancel("refund_restart_b", order, "restart-cancel", "GENERAL");
            refund =
                jdbc.queryForObject(
                    "SELECT id FROM refunds WHERE store_order_id=?", Long.class, order);
            refunds.process(refund);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT status FROM refunds WHERE id=?", String.class, refund))
                .isEqualTo("PENDING");
          } else {
            refunds.process(refund);
            refunds.process(refund);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT status FROM refunds WHERE id=?", String.class, refund))
                .isEqualTo("COMPLETED");
          }
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM mock_refund_results WHERE refund_id=?",
                      Long.class,
                      refund))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT amount_won FROM mock_refund_results WHERE refund_id=?",
                      Long.class,
                      refund))
              .isEqualTo(2000);
        }
      }
    }
  }
}
