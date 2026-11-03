package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.admin.business.AdministratorService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "admin.bootstrap.enabled=true", "admin.bootstrap.login-id=first_admin",
      "admin.bootstrap.password=Admin1234!", "admin.bootstrap.email=admin@example.com"
    })
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class AdministratorHttpFlowTest {
  @Value("${local.server.port}")
  private int port;

  @Autowired private JdbcTemplate jdbc;
  @Autowired private AccountService accounts;
  @Autowired private AdministratorService administrator;

  private static String unique() {
    return "s" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  private HttpSessionClient login(String id, String password) throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(client.login(id, password).statusCode()).isEqualTo(200);
    client.refreshCsrf();
    return client;
  }

  private long market(HttpSessionClient admin, String name) throws Exception {
    var response =
        admin.post(
            "/api/admin/markets",
            "{\"name\":\""
                + name
                + "\",\"regionCode\":\"11110\",\"address\":\"서울특별시 종로구 창경궁로 88\",\"latitude\":37.57,\"longitude\":127.0}",
            "application/json",
            true);
    assertThat(response.statusCode()).isEqualTo(201);
    return admin.json(response).get("id").asLong();
  }

  private String registration(long market, String id, String name) {
    return "{\"marketId\":"
        + market
        + ",\"name\":\""
        + name
        + "\",\"loginId\":\""
        + id
        + "\",\"password\":\"First1234!\",\"email\":\""
        + id
        + "@example.com\",\"contactName\":\"김담당\",\"contactPhone\":\"010-1234-5678\"}";
  }

  @Test
  void registrationPasswordChangeAndContactPrivacy() throws Exception {
    String id = unique();
    try (var admin = login("first_admin", "Admin1234!")) {
      long market = market(admin, unique());
      var response =
          admin.post(
              "/api/admin/stores", registration(market, id, "처음매장"), "application/json", true);
      assertThat(response.statusCode()).isEqualTo(201);
      long store = admin.json(response).get("id").asLong();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type IN ('STORE','SELLER') AND after_value LIKE ?",
                  Long.class,
                  "%" + id + "%"))
          .isEqualTo(2L);
      try (var seller = login(id, "First1234!")) {
        assertThat(seller.get("/api/seller/stores/me").statusCode()).isEqualTo(403);
        assertThat(seller.get("/api/seller/stores/" + store + "/products").statusCode())
            .isEqualTo(403);
        assertThat(seller.get("/api/auth/me").body()).contains("\"requiresPasswordChange\":true");
        assertThat(seller.get("/api/seller/profile").body()).contains("김담당", "01012345678");
        assertThat(
                seller
                    .put(
                        "/api/seller/password",
                        "{\"currentPassword\":\"wrong\",\"newPassword\":\"Next1234!\"}",
                        true)
                    .statusCode())
            .isEqualTo(400);
        assertThat(
                seller
                    .put(
                        "/api/seller/password",
                        "{\"currentPassword\":\"First1234!\",\"newPassword\":\"First1234!\"}",
                        true)
                    .statusCode())
            .isEqualTo(400);
        assertThat(
                seller
                    .put(
                        "/api/seller/password",
                        "{\"currentPassword\":\"First1234!\",\"newPassword\":\"Next1234!\"}",
                        false)
                    .statusCode())
            .isEqualTo(403);
        assertThat(
                seller
                    .put(
                        "/api/seller/password",
                        "{\"currentPassword\":\"First1234!\",\"newPassword\":\"Next1234!\"}",
                        true)
                    .statusCode())
            .isEqualTo(200);
        assertThat(seller.get("/api/seller/stores/me").statusCode()).isEqualTo(200);
        assertThat(seller.get("/api/admin/members?role=SELLER").statusCode()).isEqualTo(403);
        assertThat(seller.put("/api/seller/profile", "{}", true).statusCode()).isEqualTo(405);
      }
      try (var old = new HttpSessionClient(port)) {
        old.refreshCsrf();
        assertThat(old.login(id, "First1234!").statusCode()).isEqualTo(401);
      }
      long account =
          jdbc.queryForObject("SELECT id FROM accounts WHERE login_id=?", Long.class, id);
      var contact =
          admin.put(
              "/api/admin/sellers/" + account + "/contact",
              "{\"contactName\":\"새담당\",\"contactPhone\":\"02-1234-5678\",\"email\":\" Updated"
                  + id
                  + "@Example.com \"}",
              true);
      assertThat(contact.statusCode()).isEqualTo(200);
      assertThat(contact.body()).contains("새담당", "0212345678", "updated" + id + "@example.com");
      var history = admin.get("/api/admin/changes?type=SELLER");
      assertThat(history.statusCode()).isEqualTo(200);
      assertThat(history.body())
          .contains("김담당", "새담당")
          .doesNotContain("First1234!", "Next1234!", "password_hash");
      assertThat(admin.get("/api/admin/changes?from=2026-10-20&until=2026-10-01").statusCode())
          .isEqualTo(400);
      assertThat(admin.get("/api/admin/stores?page=-1").statusCode()).isEqualTo(400);
    }
  }

  @Test
  void registrationConflictsAndAuditFailureRollBackAllChanges() throws Exception {
    try (var admin = login("first_admin", "Admin1234!")) {
      long market = market(admin, unique());
      String id = unique();
      assertThat(
              admin
                  .post(
                      "/api/admin/stores",
                      registration(market, id, "정상매장"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(201);
      long stores = jdbc.queryForObject("SELECT count(*) FROM stores", Long.class);
      long audits = jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class);
      assertThat(
              admin
                  .post(
                      "/api/admin/stores",
                      registration(market, id, "중복매장"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
      String missing = unique();
      assertThat(
              admin
                  .post(
                      "/api/admin/stores",
                      registration(market, missing, "미등록").replace("김담당", ""),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(
              admin
                  .post(
                      "/api/admin/stores",
                      registration(Long.MAX_VALUE, missing, "없는시장"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM stores", Long.class)).isEqualTo(stores);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class))
          .isEqualTo(audits);
      jdbc.execute(
          "ALTER TABLE administrator_changes ADD CONSTRAINT test_audit_failure CHECK(after_value NOT LIKE '%rollbackmarker%') NOT VALID");
      String rollbackId = unique();
      try {
        assertThat(
                admin
                    .post(
                        "/api/admin/stores",
                        registration(market, rollbackId, "rollbackmarker"),
                        "application/json",
                        true)
                    .statusCode())
            .isEqualTo(500);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM accounts WHERE login_id=?", Long.class, rollbackId))
            .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM stores", Long.class))
            .isEqualTo(stores);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class))
            .isEqualTo(audits);
      } finally {
        jdbc.execute("ALTER TABLE administrator_changes DROP CONSTRAINT test_audit_failure");
      }
    }
  }

  @Test
  void existingSellerAndAllOtherRolesRetainBoundaries() throws Exception {
    String buyer = unique(), seller = unique();
    accounts.ensureDemoAccount(buyer, "Pass1234!", "시장손님", buyer + "@example.com", "BUYER");
    accounts.ensureDemoAccount(seller, "Pass1234!", "기존판매자", seller + "@example.com", "SELLER");
    try (var anonymous = new HttpSessionClient(port);
        var buyerClient = login(buyer, "Pass1234!");
        var sellerClient = login(seller, "Pass1234!");
        var admin = login("first_admin", "Admin1234!")) {
      for (String path :
          java.util.List.of(
              "/api/admin/markets",
              "/api/admin/stores",
              "/api/admin/members?role=BUYER",
              "/api/admin/orders",
              "/api/admin/sales",
              "/api/admin/changes")) {
        assertThat(anonymous.get(path).statusCode()).isEqualTo(401);
        assertThat(buyerClient.get(path).statusCode()).isEqualTo(403);
        assertThat(sellerClient.get(path).statusCode()).isEqualTo(403);
      }
      assertThat(sellerClient.get("/api/auth/me").body())
          .contains("\"requiresPasswordChange\":false");
      assertThat(sellerClient.get("/api/seller/profile").body()).contains("\"contactName\":null");
      assertThat(buyerClient.get("/api/seller/profile").statusCode()).isEqualTo(403);
      assertThat(admin.get("/api/buyer/markets").statusCode()).isEqualTo(403);
      assertThat(admin.get("/api/seller/profile").statusCode()).isEqualTo(403);
      assertThat(
              admin
                  .post("/api/admin/markets", "{\"name\":\"차단\"}", "application/json", false)
                  .statusCode())
          .isEqualTo(403);
      assertThat(admin.get("/api/admin/sales?date=2000-01-01").body()).isEqualTo("[]");
      assertThat(admin.get("/api/admin/orders/9223372036854775807/items").body()).isEqualTo("[]");
      assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> administrator.markets(buyer)))
          .isInstanceOf(
              com.mirinae.market.modules.account.business.AccountForbiddenException.class);
    }
  }

  @Autowired private ProductHttpFlowTest.TestClock clock;
  @Autowired private com.mirinae.market.modules.store.business.StoreService stores;

  @org.junit.jupiter.api.BeforeEach
  void fixedTime() {
    clock.set(java.time.Instant.parse("2026-10-13T03:00:00Z"));
  }

  @Test
  void confirmedOrdersKeepSnapshotsAndSalesIncludeStoppedAndArchivedProducts() throws Exception {
    String seller = unique(), buyer = unique();
    accounts.ensureDemoAccount(seller, "Pass1234!", "기존판매자", seller + "@example.com", "SELLER");
    accounts.ensureDemoAccount(buyer, "Pass1234!", "구매손님", buyer + "@example.com", "BUYER");
    var store = stores.ensureDemoStore(seller, unique(), "이전매장이름");
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00')",
        store.id());
    long product =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,'기록사과','COUNT',12) RETURNING id",
            Long.class,
            store.id());
    long offer =
        jdbc.queryForObject(
            "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',1000,10) RETURNING id",
            Long.class,
            store.id(),
            product);
    try (var customer = login(buyer, "Pass1234!");
        var admin = login("first_admin", "Admin1234!")) {
      var cart =
          customer.put(
              "/api/buyer/cart/items/" + offer,
              "{\"marketId\":" + store.marketId() + ",\"quantity\":2}",
              true);
      assertThat(cart.statusCode()).isEqualTo(200);
      long version = customer.json(cart).get("version").asLong();
      var paid =
          customer.post(
              "/api/buyer/checkouts",
              "{\"requestKey\":\"confirmed-admin\",\"cartVersion\":"
                  + version
                  + ",\"mode\":\"SUCCESS\"}",
              "application/json",
              true);
      assertThat(customer.json(paid).get("status").asString()).isEqualTo("CONFIRMED");
      long order = customer.json(paid).get("id").asLong();
      assertThat(
              admin
                  .put("/api/admin/stores/" + store.id(), "{\"name\":\"새매장이름\"}", true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              admin
                  .put(
                      "/api/admin/markets/" + store.marketId(),
                      "{\"name\":\"정정시장" + unique() + "\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      jdbc.update("UPDATE daily_offers SET price_won=9000,active=false WHERE id=?", offer);
      jdbc.update("UPDATE products SET archived_at=CURRENT_TIMESTAMP WHERE id=?", product);
      var orders = admin.get("/api/admin/orders?query=" + buyer);
      assertThat(orders.statusCode()).isEqualTo(200);
      assertThat(orders.body()).contains(buyer, "2000");
      var detail = admin.get("/api/admin/orders/" + order + "/items");
      assertThat(detail.body())
          .contains("이전매장이름", "기록사과", "1000", "14:00", "18:00")
          .doesNotContain("새매장이름", "9000");
      var sales =
          admin.get(
              "/api/admin/sales?date=2026-10-13&query="
                  + java.net.URLEncoder.encode("기록사과", java.nio.charset.StandardCharsets.UTF_8));
      assertThat(sales.statusCode()).isEqualTo(200);
      assertThat(sales.body())
          .contains("9000", "\"onlineQuantity\":8", "\"active\":false", "\"archived\":true");
      assertThat(admin.get("/api/admin/sales?date=2026-10-12&query=" + seller).body())
          .isEqualTo("[]");
      assertThat(
              admin
                  .get(
                      "/api/admin/changes?type=STORE&targetId="
                          + store.id()
                          + "&from=2026-10-13&until=2026-10-13")
                  .body())
          .contains("이전매장이름", "새매장이름");
      assertThat(
              admin
                  .get(
                      "/api/admin/changes?type=STORE&targetId="
                          + store.id()
                          + "&from=2026-10-14&until=2026-10-14")
                  .body())
          .isEqualTo("[]");
      assertThat(admin.get("/api/admin/changes?targetId=0").statusCode()).isEqualTo(400);
      jdbc.update(
          "INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,due_at,created_at) VALUES (?, 'not-confirmed',999,'SUCCESS','FAILED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
          accounts.current(buyer).id());
      assertThat(admin.json(admin.get("/api/admin/orders?query=" + buyer)).size()).isEqualTo(1);
    }
  }

  @Test
  void concurrentRegistrationHasOneOwnerAndContactConflictLeavesNoAudit() throws Exception {
    try (var first = login("first_admin", "Admin1234!");
        var second = login("first_admin", "Admin1234!")) {
      long market = market(first, unique());
      String id = unique();
      String payload = registration(market, id, "동시매장");
      var a = first.postAsync("/api/admin/stores", payload);
      var b = second.postAsync("/api/admin/stores", payload);
      assertThat(java.util.List.of(a.get().statusCode(), b.get().statusCode()))
          .containsExactlyInAnyOrder(201, 409);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM stores WHERE market_id=?", Long.class, market))
          .isEqualTo(1L);
      assertThat(
              jdbc.queryForObject("SELECT count(*) FROM accounts WHERE login_id=?", Long.class, id))
          .isEqualTo(1L);
      long account = accounts.current(id).id();
      long count = jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class);
      assertThat(
              first
                  .put(
                      "/api/admin/sellers/" + account + "/contact",
                      "{\"contactName\":\"변경담당\",\"contactPhone\":\"01012345678\",\"email\":\"admin@example.com\"}",
                      true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(accounts.profile(id).contactName()).isEqualTo("김담당");
      assertThat(jdbc.queryForObject("SELECT count(*) FROM administrator_changes", Long.class))
          .isEqualTo(count);
      String hash =
          jdbc.queryForObject(
              "SELECT password_hash FROM accounts WHERE login_id='first_admin'", String.class);
      accounts.bootstrapAdministrator("first_admin", "Different1234!", "other@example.com");
      assertThat(
              jdbc.queryForObject(
                  "SELECT password_hash FROM accounts WHERE login_id='first_admin'", String.class))
          .isEqualTo(hash);
      assertThat(
              jdbc.queryForObject("SELECT count(*) FROM accounts WHERE role='ADMIN'", Long.class))
          .isEqualTo(1L);
    }
  }

  @Test
  void koreanMidnightControlsDefaultSalesDateAndAuditDateBoundaries() throws Exception {
    String seller = unique();
    accounts.ensureDemoAccount(seller, "Pass1234!", "기존판매자", seller + "@example.com", "SELLER");
    var store = stores.ensureDemoStore(seller, unique(), "자정매장");
    long product =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,'자정상품','COUNT',1) RETURNING id",
            Long.class,
            store.id());
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-14','14:00','18:00','13:00')",
        store.id());
    jdbc.update(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-14',1000,7)",
        store.id(),
        product);
    clock.set(java.time.Instant.parse("2026-10-13T15:00:00Z"));
    try (var admin = login("first_admin", "Admin1234!")) {
      String renamed = "자정시장" + unique();
      assertThat(
              admin
                  .put(
                      "/api/admin/markets/" + store.marketId(),
                      "{\"name\":\"" + renamed + "\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(admin.get("/api/admin/sales").body()).contains("자정상품");
      String history = "/api/admin/changes?type=MARKET&targetId=" + store.marketId();
      assertThat(admin.get(history + "&from=2026-10-14&until=2026-10-14").body()).contains(renamed);
      assertThat(admin.get(history + "&from=2026-10-13&until=2026-10-13").body()).isEqualTo("[]");
      assertThat(admin.get(history).body()).contains(renamed);
    }
  }
}
