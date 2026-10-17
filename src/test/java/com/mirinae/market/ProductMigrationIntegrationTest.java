package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

class ProductMigrationIntegrationTest {
  @Test
  void upgradesExistingV1DatabaseWithoutChangingAccountsMarketsOrStores() throws Exception {
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
      Flyway.configure().dataSource(dataSource).target("5").load().migrate();
      assertThat(
              postgres
                  .execInContainer(
                      "pg_dump",
                      "-U",
                      postgres.getUsername(),
                      "-d",
                      postgres.getDatabaseName(),
                      "-Fc",
                      "-f",
                      "/tmp/pre-phase4.dump")
                  .getExitCode())
          .isZero();
      assertThat(
              postgres
                  .execInContainer(
                      "psql",
                      "-U",
                      postgres.getUsername(),
                      "-d",
                      postgres.getDatabaseName(),
                      "-c",
                      "CREATE DATABASE phase4_restore")
                  .getExitCode())
          .isZero();
      assertThat(
              postgres
                  .execInContainer(
                      "pg_restore",
                      "-U",
                      postgres.getUsername(),
                      "-d",
                      "phase4_restore",
                      "/tmp/pre-phase4.dump")
                  .getExitCode())
          .isZero();
      var restoredSource =
          new DriverManagerDataSource(
              postgres.getJdbcUrl().replace("/" + postgres.getDatabaseName(), "/phase4_restore"),
              postgres.getUsername(),
              postgres.getPassword());
      var restored = new JdbcTemplate(restoredSource);
      assertThat(restored.queryForObject("SELECT count(*) FROM products", Long.class)).isEqualTo(1);
      assertThat(restored.queryForObject("SELECT online_quantity FROM daily_offers", Integer.class))
          .isEqualTo(10);
      assertThat(
              restored.queryForObject(
                  "SELECT max(version::integer) FROM flyway_schema_history", Integer.class))
          .isEqualTo(5);
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
              jdbc.queryForMap(
                  "SELECT region_code,address,latitude,longitude FROM markets WHERE id=?",
                  marketId))
          .allSatisfy((key, value) -> assertThat(value).isNull());
      assertThat(jdbc.queryForObject("SELECT count(*) FROM market_candidates", Long.class))
          .isEqualTo(1393L);
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
              jdbc.queryForObject(
                  "SELECT inventory_version FROM daily_offers WHERE product_id=?",
                  Long.class,
                  productId))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT orders_locked FROM pickup_windows WHERE store_id=?",
                  Boolean.class,
                  storeId))
          .isFalse();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM checkouts", Long.class)).isZero();
      assertThat(
              jdbc.queryForMap(
                  "SELECT contact_name,contact_phone,password_change_required FROM accounts WHERE id=?",
                  accountId))
          .containsEntry("contact_name", null)
          .containsEntry("contact_phone", null)
          .containsEntry("password_change_required", false);
      assertThat(
              jdbc.queryForObject("SELECT count(*) FROM accounts WHERE role='ADMIN'", Long.class))
          .isZero();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class))
          .isZero();
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
