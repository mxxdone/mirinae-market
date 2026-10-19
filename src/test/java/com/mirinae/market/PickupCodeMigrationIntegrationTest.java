package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

class PickupCodeMigrationIntegrationTest {
  @Test
  void upgradeRepairsOnlyDuplicateCodesAndEnforcesUniqueness() {
    try (var database = new PostgreSQLContainer("postgres:17.10")) {
      database.start();
      Flyway.configure()
          .dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
          .target("11")
          .load()
          .migrate();
      var jdbc =
          new JdbcTemplate(
              new DriverManagerDataSource(
                  database.getJdbcUrl(), database.getUsername(), database.getPassword()));
      long buyer =
          jdbc.queryForObject(
              "INSERT INTO accounts(login_id,password_hash,display_name,email,role) VALUES ('migration_b','unused','구매자','migration-b@example.com','BUYER') RETURNING id",
              Long.class);
      long seller =
          jdbc.queryForObject(
              "INSERT INTO accounts(login_id,password_hash,display_name,email,role) VALUES ('migration_s','unused','판매자','migration-s@example.com','SELLER') RETURNING id",
              Long.class);
      long market =
          jdbc.queryForObject(
              "INSERT INTO markets(name) VALUES ('마이그레이션시장') RETURNING id", Long.class);
      long store =
          jdbc.queryForObject(
              "INSERT INTO stores(market_id,owner_account_id,name) VALUES (?,?,'매장') RETURNING id",
              Long.class,
              market,
              seller);
      long[] orders = new long[3];
      for (int i = 0; i < 3; i++) {
        long checkout =
            jdbc.queryForObject(
                "INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,total_won,due_at,created_at,confirmed_at) VALUES (?,?,?,'SUCCESS','CONFIRMED',1000,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id",
                Long.class,
                buyer,
                "migration-" + i,
                i);
        orders[i] =
            jdbc.queryForObject(
                "INSERT INTO store_orders(checkout_id,store_id,market_id,store_name,pickup_date,start_time,end_time,order_deadline,pickup_code) VALUES (?,?,?,'매장','2026-10-13','14:00','18:00','13:00',?) RETURNING id",
                Long.class,
                checkout,
                store,
                market,
                i == 2 ? "222222" : "111111");
      }
      Flyway.configure()
          .dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
          .load()
          .migrate();
      assertThat(
              jdbc.queryForObject(
                  "SELECT pickup_code FROM store_orders WHERE id=?", String.class, orders[0]))
          .isEqualTo("111111");
      assertThat(
              jdbc.queryForObject(
                  "SELECT pickup_code FROM store_orders WHERE id=?", String.class, orders[2]))
          .isEqualTo("222222");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(DISTINCT pickup_code) FROM store_orders WHERE store_id=?",
                  Long.class,
                  store))
          .isEqualTo(3);
      assertThatThrownBy(
              () ->
                  jdbc.update("UPDATE store_orders SET pickup_code='111111' WHERE id=?", orders[1]))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
  }
}
