package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

class ProductMigrationIntegrationTest {
  @Test
  void upgradesExistingV1DatabaseWithoutChangingAccountsMarketsOrStores() {
    try (var postgres = new PostgreSQLContainer("postgres:17.10")) {
      postgres.start();
      var dataSource =
          new DriverManagerDataSource(
              postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
      var jdbc = new JdbcTemplate(dataSource);
      Flyway.configure().dataSource(dataSource).target("1").load().migrate();
      Long accountId =
          jdbc.queryForObject(
              """
          INSERT INTO accounts (login_id, password_hash, display_name, email, role)
          VALUES ('existing_seller', 'existing-hash', '판매자', 'existing@example.com', 'SELLER') RETURNING id
          """,
              Long.class);
      Long marketId =
          jdbc.queryForObject(
              "INSERT INTO markets (name) VALUES ('기존시장') RETURNING id", Long.class);
      Long storeId =
          jdbc.queryForObject(
              "INSERT INTO stores (market_id, owner_account_id, name) VALUES (?, ?, '기존매장') RETURNING id",
              Long.class,
              marketId,
              accountId);
      Flyway.configure().dataSource(dataSource).target("2").load().migrate();
      Long productId =
          jdbc.queryForObject(
              "INSERT INTO products (store_id, name, description, unit_type, unit_amount) VALUES (?, '기존양파', '기존설명', 'WEIGHT', 1000) RETURNING id",
              Long.class,
              storeId);
      jdbc.update(
          "INSERT INTO pickup_windows (store_id, pickup_date, start_time, end_time) VALUES (?, '2026-10-13', '14:00', '18:00')",
          storeId);
      jdbc.update(
          "INSERT INTO daily_offers (store_id, product_id, pickup_date, price_won, online_quantity) VALUES (?, ?, '2026-10-13', 5000, 10)",
          storeId,
          productId);
      Flyway.configure().dataSource(dataSource).load().migrate();
      assertThat(
              jdbc.queryForObject(
                  "SELECT password_hash FROM accounts WHERE id = ?", String.class, accountId))
          .isEqualTo("existing-hash");
      assertThat(jdbc.queryForObject("SELECT name FROM stores WHERE id = ?", String.class, storeId))
          .isEqualTo("기존매장");
      assertThat(
              jdbc.queryForObject("SELECT name FROM markets WHERE id = ?", String.class, marketId))
          .isEqualTo("기존시장");
      assertThat(
              jdbc.queryForObject(
                  "SELECT owner_account_id FROM stores WHERE id = ?", Long.class, storeId))
          .isEqualTo(accountId);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM products WHERE archived_at IS NULL", Long.class))
          .isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT order_deadline::text FROM pickup_windows WHERE store_id = ?",
                  String.class,
                  storeId))
          .isEqualTo("14:00:00");
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE product_id = ?",
                  Integer.class,
                  productId))
          .isEqualTo(10);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM flyway_schema_history WHERE success AND version IN ('1','2','3','4')",
                  Long.class))
          .isEqualTo(4L);
      assertThat(
              Flyway.configure()
                  .dataSource(dataSource)
                  .load()
                  .validateWithResult()
                  .validationSuccessful)
          .isTrue();
    }
  }
}
