package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.checkout.business.RefundService;
import com.mirinae.market.modules.checkout.business.StoreOrderView;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "mirinae.refund.recovery.enabled=false", "admin.bootstrap.enabled=true",
      "admin.bootstrap.login-id=fulfillment_admin", "admin.bootstrap.password=Admin1234!",
      "admin.bootstrap.email=fulfillment-admin@example.com"
    })
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class FulfillmentHttpFlowTest {
  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private CheckoutService checkout;
  @Autowired private RefundService refunds;

  @Autowired
  private com.mirinae.market.modules.checkout.business.RefundTransactions refundTransactions;

  @Autowired private com.mirinae.market.modules.checkout.business.MockRefundService mockRefunds;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ProductHttpFlowTest.TestClock clock;

  @Value("${local.server.port}")
  private int port;

  private String buyer;
  private String seller;
  private long market;
  private long store;
  private long offer;
  private long secondOffer;

  @BeforeEach
  void fixture() {
    clock.set(Instant.parse("2026-10-13T03:00:00Z"));
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    buyer = "b" + suffix;
    seller = "s" + suffix;
    accounts.ensureDemoAccount(buyer, "Pass1234!", "구매자", buyer + "@example.com", "BUYER");
    accounts.ensureDemoAccount(seller, "Pass1234!", "판매자", seller + "@example.com", "SELLER");
    var result = stores.ensureDemoStore(seller, "수령시장" + suffix, "수령매장");
    store = result.id();
    market = result.marketId();
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00')",
        store);
    offer = offer("사과");
    secondOffer = offer("배");
  }

  private long offer(String name) {
    long product =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,?,'COUNT',1) RETURNING id",
            Long.class,
            store,
            name);
    return jdbc.queryForObject(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',1000,10) RETURNING id",
        Long.class,
        store,
        product);
  }

  @Test
  void providerErrorsStopAfterFourAttemptsAndDoNotBlockOtherRefunds() throws Exception {
    var first = order();
    try (var customer = session(buyer)) {
      customer.post(
          buyerPath(first.id()) + "/cancellations",
          cancel("first", "GENERAL"),
          "application/json",
          true);
      var second = order();
      customer.post(
          buyerPath(second.id()) + "/cancellations",
          cancel("second", "GENERAL"),
          "application/json",
          true);
      long firstRefund = refundId(first.id()), secondRefund = refundId(second.id());
      String trigger = "provider_fail_" + firstRefund;
      jdbc.execute(
          "CREATE FUNCTION "
              + trigger
              + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'provider unavailable'; END $$");
      jdbc.execute(
          "CREATE TRIGGER "
              + trigger
              + " BEFORE INSERT ON mock_refund_results FOR EACH ROW WHEN (NEW.refund_id="
              + firstRefund
              + ") EXECUTE FUNCTION "
              + trigger
              + "()");
      try {
        for (int seconds : new int[] {0, 1, 6, 36, 80}) {
          clock.set(Instant.parse("2026-10-13T03:00:00Z").plusSeconds(seconds));
          refunds.recoverDue();
        }
        assertThat(
                jdbc.queryForObject(
                    "SELECT attempts FROM refunds WHERE id=?", Integer.class, firstRefund))
            .isEqualTo(4);
        assertThat(
                jdbc.queryForObject(
                    "SELECT status FROM refunds WHERE id=?", String.class, firstRefund))
            .isEqualTo("NEEDS_ATTENTION");
        assertThat(
                jdbc.queryForObject(
                    "SELECT status FROM refunds WHERE id=?", String.class, secondRefund))
            .isEqualTo("COMPLETED");
      } finally {
        jdbc.execute("DROP TRIGGER " + trigger + " ON mock_refund_results");
        jdbc.execute("DROP FUNCTION " + trigger + "()");
      }
    }
  }

  @Test
  void concurrentRefundProcessingMakesOnlyOneProviderResult() throws Exception {
    var existing = order();
    try (var customer = session(buyer)) {
      customer.post(
          buyerPath(existing.id()) + "/cancellations",
          cancel("parallel-refund", "GENERAL"),
          "application/json",
          true);
      long id = refundId(existing.id());
      var one = java.util.concurrent.CompletableFuture.runAsync(() -> refunds.process(id));
      var two = java.util.concurrent.CompletableFuture.runAsync(() -> refunds.process(id));
      java.util.concurrent.CompletableFuture.allOf(one, two).get(30, TimeUnit.SECONDS);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, id))
          .isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("COMPLETED");
    }
  }

  @Test
  void providerSuccessSurvivesLocalCompletionRollback() throws Exception {
    var existing = order();
    try (var customer = session(buyer)) {
      customer.post(
          buyerPath(existing.id()) + "/cancellations",
          cancel("rollback-refund", "GENERAL"),
          "application/json",
          true);
      long id = refundId(existing.id());
      String trigger = "refund_commit_" + id;
      jdbc.execute(
          "CREATE FUNCTION "
              + trigger
              + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'local unavailable'; END $$");
      jdbc.execute(
          "CREATE TRIGGER "
              + trigger
              + " BEFORE UPDATE ON refunds FOR EACH ROW WHEN (NEW.id="
              + id
              + " AND NEW.status='COMPLETED') EXECUTE FUNCTION "
              + trigger
              + "()");
      try {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> refunds.process(id))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
            .isEqualTo("PENDING");
        assertThat(
                jdbc.queryForObject("SELECT attempts FROM refunds WHERE id=?", Integer.class, id))
            .isEqualTo(1);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, id))
            .isEqualTo(1);
      } finally {
        jdbc.execute("DROP TRIGGER " + trigger + " ON refunds");
        jdbc.execute("DROP FUNCTION " + trigger + "()");
      }
      clock.set(Instant.parse("2026-10-13T03:00:31Z"));
      refunds.process(id);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("COMPLETED");
      assertThat(jdbc.queryForObject("SELECT attempts FROM refunds WHERE id=?", Integer.class, id))
          .isEqualTo(1);
    }
  }

  @Test
  void inventoryOverflowRollsBackAllCancellationItemsAndRefundWork() throws Exception {
    var existing = order();
    jdbc.update("UPDATE daily_offers SET online_quantity=2147483647 WHERE id=?", secondOffer);
    try (var customer = session(buyer)) {
      var result =
          customer.post(
              buyerPath(existing.id()) + "/cancellations",
              cancel("overflow", "GENERAL"),
              "application/json",
              true);
      assertThat(result.statusCode()).isEqualTo(409);
      assertThat(customer.json(result).get("code").asString())
          .isEqualTo("INVENTORY_RESTORE_OVERFLOW");
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(8);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM order_items WHERE store_order_id=? AND cancelled_at IS NOT NULL",
                  Long.class,
                  existing.id()))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, existing.id()))
          .isZero();
      jdbc.update("UPDATE daily_offers SET online_quantity=2147483646 WHERE id=?", secondOffer);
      assertThat(
              customer
                  .post(
                      buyerPath(existing.id()) + "/cancellations",
                      cancel("overflow", "GENERAL"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?",
                  Integer.class,
                  secondOffer))
          .isEqualTo(Integer.MAX_VALUE);
    }
  }

  @Test
  void stoppedAndArchivedProductsAreNotRestoredByGeneralCancellation() throws Exception {
    var existing = order();
    jdbc.update("UPDATE daily_offers SET active=false WHERE id=?", offer);
    jdbc.update(
        "UPDATE products SET archived_at=CURRENT_TIMESTAMP WHERE id=(SELECT product_id FROM daily_offers WHERE id=?)",
        secondOffer);
    try (var customer = session(buyer)) {
      assertThat(
              customer
                  .post(
                      buyerPath(existing.id()) + "/cancellations",
                      cancel("inactive", "GENERAL"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(8);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?",
                  Integer.class,
                  secondOffer))
          .isEqualTo(9);
    }
  }

  @Test
  void failureIsAllowedAfterPickupDeadlineButRejectedAtKoreanMidnight() throws Exception {
    var existing = order();
    try (var merchant = session(seller)) {
      clock.set(Instant.parse("2026-10-13T14:59:59Z"));
      assertThat(
              merchant
                  .post(
                      sellerPath(existing.id()) + "/failures",
                      json(
                          Map.of(
                              "requestKey",
                              "late-failure",
                              "itemIds",
                              java.util.List.of(existing.items().getFirst().id()),
                              "reason",
                              "미수령 상품 제공 불가 확인")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      clock.set(Instant.parse("2026-10-13T15:00:00Z"));
      assertThat(
              merchant
                  .post(
                      sellerPath(existing.id()) + "/failures",
                      json(
                          Map.of(
                              "requestKey",
                              "midnight-failure",
                              "itemIds",
                              java.util.List.of(existing.items().getLast().id()),
                              "reason",
                              "제공 불가")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
    }
  }

  @Test
  void buyerAndAdministratorConcurrentCancellationCannotDuplicateRefunds() throws Exception {
    var existing = order();
    try (var customer = session(buyer);
        var admin = session("fulfillment_admin")) {
      var customerRequest =
          customer.postAsync(
              buyerPath(existing.id()) + "/cancellations", cancel("buyer-race", "GENERAL"));
      var adminRequest =
          admin.postAsync(
              "/api/admin/store-orders/" + existing.id() + "/cancellations",
              json(
                  Map.of(
                      "requestKey",
                      "admin-race",
                      "reasonType",
                      "STORE_FAULT",
                      "reason",
                      "매장 제공 불가 확인")));
      assertThat(
              java.util.List.of(
                  customerRequest.get(30, TimeUnit.SECONDS).statusCode(),
                  adminRequest.get(30, TimeUnit.SECONDS).statusCode()))
          .containsExactlyInAnyOrder(200, 409);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, existing.id()))
          .isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(DISTINCT cancelled_by) FROM order_items WHERE store_order_id=?",
                  Long.class,
                  existing.id()))
          .isEqualTo(1);
    }
  }

  @Test
  void concurrentReportsCreateOneOpenReport() throws Exception {
    try (var one = session(buyer);
        var two = session(buyer)) {
      String path = "/api/buyer/stores/" + store + "/reports",
          body = json(Map.of("type", "INACTIVE", "description", "장기 미운영 확인 요청"));
      var a = one.postAsync(path, body);
      var b = two.postAsync(path, body);
      assertThat(one.json(a.get(30, TimeUnit.SECONDS)).get("id").asLong())
          .isEqualTo(two.json(b.get(30, TimeUnit.SECONDS)).get("id").asLong());
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM store_reports WHERE store_id=?", Long.class, store))
          .isEqualTo(1);
    }
  }

  @Test
  void pickupCodesAreUniqueWithinStoreAndDate() {
    var first = order();
    var second = order();
    assertThat(first.pickupCode()).matches("[0-9]{6}").isNotEqualTo(second.pickupCode());
  }

  @Test
  void cancellationAndSellerInventorySaveShareVersionAndStoreLock() throws Exception {
    var existing = order();
    long product =
        jdbc.queryForObject("SELECT product_id FROM daily_offers WHERE id=?", Long.class, offer);
    long version =
        jdbc.queryForObject(
            "SELECT inventory_version FROM daily_offers WHERE id=?", Long.class, offer);
    try (var customer = session(buyer);
        var merchant = session(seller)) {
      String sale =
          json(
              Map.of(
                  "orderDeadline",
                  "13:00",
                  "startTime",
                  "14:00",
                  "endTime",
                  "18:00",
                  "products",
                  java.util.List.of(
                      Map.of(
                          "productId",
                          product,
                          "selling",
                          true,
                          "priceWon",
                          1000,
                          "onlineQuantity",
                          15,
                          "inventoryVersion",
                          version))));
      var saleRequest =
          merchant.putAsync("/api/seller/stores/" + store + "/sales/2026-10-13", sale);
      var cancellation =
          customer.postAsync(
              buyerPath(existing.id()) + "/cancellations", cancel("sale-race", "GENERAL"));
      int saleStatus = saleRequest.get(30, TimeUnit.SECONDS).statusCode();
      assertThat(saleStatus).isIn(204, 409);
      assertThat(cancellation.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(saleStatus == 204 ? 17 : 10);
    }
  }

  @Test
  void checkoutConfirmationAndSuspensionRacePreservesAtomicOutcome() throws Exception {
    var cart = checkout.put(buyer, market, offer, 2);
    String key = "suspension-race";
    checkout.start(buyer, key, cart.version(), "DELAY");
    clock.set(Instant.parse("2026-10-13T03:00:04Z"));
    try (var admin = session("fulfillment_admin")) {
      var stop =
          admin.putAsync(
              "/api/admin/stores/" + store + "/operation",
              json(Map.of("suspended", true, "reason", "휴업 확인")));
      var purchase = java.util.concurrent.CompletableFuture.runAsync(checkout::recover);
      assertThat(stop.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
      purchase.get(30, TimeUnit.SECONDS);
      var result = checkout.result(buyer, key);
      assertThat(result.status()).isIn("CONFIRMED", "FAILED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(result.status().equals("CONFIRMED") ? 8 : 10);
      assertThat(result.storeOrders()).hasSize(result.status().equals("CONFIRMED") ? 1 : 0);
    }
  }

  @Test
  void auditFailureRollsBackReportResolutionAndRefundRetry() throws Exception {
    var existing = order();
    try (var customer = session(buyer);
        var admin = session("fulfillment_admin")) {
      customer.post(
          buyerPath(existing.id()) + "/cancellations",
          cancel("audit-retry", "GENERAL"),
          "application/json",
          true);
      long refund = refundId(existing.id());
      jdbc.update("UPDATE refunds SET status='NEEDS_ATTENTION' WHERE id=?", refund);
      var response =
          customer.post(
              "/api/buyer/stores/" + store + "/reports",
              json(Map.of("type", "INACTIVE", "description", "운영 여부 확인")),
              "application/json",
              true);
      long report = customer.json(response).get("id").asLong();
      String trigger = "audit_retry_" + store;
      jdbc.execute(
          "CREATE FUNCTION "
              + trigger
              + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$");
      jdbc.execute(
          "CREATE TRIGGER "
              + trigger
              + " BEFORE INSERT ON administrator_changes FOR EACH ROW WHEN (NEW.target_type IN ('REFUND','STORE_REPORT')) EXECUTE FUNCTION "
              + trigger
              + "()");
      try {
        assertThat(
                admin
                    .post("/api/admin/refunds/" + refund + "/retry", "{}", "application/json", true)
                    .statusCode())
            .isEqualTo(500);
        assertThat(
                admin
                    .patch(
                        "/api/admin/store-reports/" + report,
                        json(Map.of("status", "RESOLVED", "resolution", "정상 운영 확인")),
                        true)
                    .statusCode())
            .isEqualTo(500);
        assertThat(
                jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, refund))
            .isEqualTo("NEEDS_ATTENTION");
        assertThat(
                jdbc.queryForObject(
                    "SELECT status FROM store_reports WHERE id=?", String.class, report))
            .isEqualTo("OPEN");
      } finally {
        jdbc.execute("DROP TRIGGER " + trigger + " ON administrator_changes");
        jdbc.execute("DROP FUNCTION " + trigger + "()");
      }
    }
  }

  @Test
  void fourthAttemptLostResponseStillCompletesFromProviderRecord() throws Exception {
    var existing = order();
    try (var customer = session(buyer)) {
      customer.post(
          buyerPath(existing.id()) + "/cancellations",
          cancel("fourth-lost", "GENERAL"),
          "application/json",
          true);
      long id = refundId(existing.id());
      jdbc.update("UPDATE refunds SET mode='LOST_RESPONSE',attempts=3 WHERE id=?", id);
      refunds.process(id);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("COMPLETED");
      assertThat(jdbc.queryForObject("SELECT attempts FROM refunds WHERE id=?", Integer.class, id))
          .isEqualTo(4);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, id))
          .isEqualTo(1);
    }
  }

  @Test
  void expiredClaimCanBeReplacedAndLateFailureCannotOverwriteNewAttempt() throws Exception {
    var existing = order();
    try (var customer = session(buyer)) {
      customer.post(
          buyerPath(existing.id()) + "/cancellations",
          cancel("lease", "GENERAL"),
          "application/json",
          true);
      long id = refundId(existing.id());
      var old = refundTransactions.claim(id).orElseThrow();
      assertThat(refundTransactions.claim(id)).isEmpty();
      clock.set(Instant.parse("2026-10-13T03:00:31Z"));
      var current = refundTransactions.claim(id).orElseThrow();
      assertThat(current.token()).isNotEqualTo(old.token());
      refundTransactions.finish(old, "이전 시도의 늦은 실패", true);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("PENDING");
      assertThat(jdbc.queryForObject("SELECT attempts FROM refunds WHERE id=?", Integer.class, id))
          .isEqualTo(2);
      mockRefunds.complete(id, current.amountWon());
      refundTransactions.finish(current, null, false);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("COMPLETED");
    }
  }

  @Test
  void failureRejectsForeignOrderItemAsInputErrorWithoutCancellingAnything() throws Exception {
    var first = order();
    var second = order();
    try (var merchant = session(seller)) {
      assertThat(
              merchant
                  .post(
                      sellerPath(first.id()) + "/failures",
                      json(
                          Map.of(
                              "requestKey",
                              "foreign-item",
                              "itemIds",
                              java.util.List.of(second.items().getFirst().id()),
                              "reason",
                              "제공 불가")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM order_items WHERE store_order_id=? AND cancelled_at IS NOT NULL",
                  Long.class,
                  first.id()))
          .isZero();
    }
  }

  private long refundId(long order) {
    return jdbc.queryForObject("SELECT id FROM refunds WHERE store_order_id=?", Long.class, order);
  }

  private StoreOrderView order() {
    checkout.put(buyer, market, offer, 2);
    var cart = checkout.put(buyer, market, secondOffer, 1);
    return checkout
        .start(buyer, UUID.randomUUID().toString(), cart.version(), "SUCCESS")
        .checkout()
        .storeOrders()
        .getFirst();
  }

  @Test
  void storeReportsDeduplicateCountDistinctBuyersAndAllowNewReportAfterResolution()
      throws Exception {
    String path = "/api/buyer/stores/" + store + "/reports";
    String body = json(Map.of("type", "CLOSURE_SUSPECTED", "description", "영업 여부 확인 요청"));
    try (var customer = session(buyer);
        var admin = session("fulfillment_admin")) {
      var first = customer.post(path, body, "application/json", true);
      assertThat(first.statusCode()).isEqualTo(200);
      long report = customer.json(first).get("id").asLong();
      assertThat(
              customer.json(customer.post(path, body, "application/json", true)).get("id").asLong())
          .isEqualTo(report);
      for (int i = 0; i < 2; i++) {
        String other = "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        accounts.ensureDemoAccount(other, "Pass1234!", "제보자", other + "@example.com", "BUYER");
        try (var otherClient = session(other)) {
          assertThat(otherClient.post(path, body, "application/json", true).statusCode())
              .isEqualTo(200);
        }
      }
      var reports = admin.json(admin.get("/api/admin/store-reports"));
      var managed =
          reports
              .valueStream()
              .filter(r -> r.get("report").get("id").asLong() == report)
              .findFirst()
              .orElseThrow();
      assertThat(managed.get("unresolvedClosureCount").asInt()).isEqualTo(3);
      assertThat(managed.get("needsContact").asBoolean()).isTrue();
      assertThat(customer.get(path).body()).doesNotContain("buyerLoginId", "contactPhone");
      String statusPath = "/api/admin/store-reports/" + report;
      assertThat(admin.patch(statusPath, json(Map.of("status", "RESOLVED")), true).statusCode())
          .isEqualTo(400);
      assertThat(
              admin
                  .patch(
                      statusPath,
                      json(Map.of("status", "RESOLVED", "resolution", "담당자 통화로 정상 영업 확인")),
                      true)
                  .statusCode())
          .isEqualTo(204);
      assertThat(admin.patch(statusPath, json(Map.of("status", "OPEN")), true).statusCode())
          .isEqualTo(409);
      assertThat(
              customer.json(customer.post(path, body, "application/json", true)).get("id").asLong())
          .isNotEqualTo(report);
      assertThat(
              jdbc.queryForObject("SELECT suspended FROM stores WHERE id=?", Boolean.class, store))
          .isFalse();
    }
  }

  @Test
  void suspensionHidesLastStoreMarketAndBlocksPendingPurchaseWhileKeepingExistingOrder()
      throws Exception {
    var existing = order();
    var cart = checkout.put(buyer, market, offer, 1);
    String key = UUID.randomUUID().toString();
    assertThat(checkout.start(buyer, key, cart.version(), "DELAY").checkout().status())
        .isEqualTo("PENDING");
    try (var admin = session("fulfillment_admin");
        var customer = session(buyer);
        var merchant = session(seller)) {
      String path = "/api/admin/stores/" + store + "/operation";
      String body = json(Map.of("suspended", true, "reason", "담당자에게 임시 휴업 확인"));
      assertThat(customer.put(path, body, true).statusCode()).isEqualTo(403);
      assertThat(admin.put(path, body, true).statusCode()).isEqualTo(204);
      assertThat(admin.put(path, body, true).statusCode()).isEqualTo(204);
      assertThat(
              customer
                  .json(customer.get("/api/markets"))
                  .valueStream()
                  .anyMatch(item -> item.get("id").asLong() == market))
          .isFalse();
      assertThat(customer.get("/api/markets/" + market + "/offers/" + offer).statusCode())
          .isEqualTo(404);
      assertThat(customer.get(buyerPath(existing.id())).statusCode()).isEqualTo(200);
      assertThat(merchant.get("/api/seller/stores/" + store + "/orders").statusCode())
          .isEqualTo(200);
      clock.set(Instant.parse("2026-10-13T03:00:04Z"));
      checkout.recover();
      assertThat(checkout.result(buyer, key).status()).isEqualTo("FAILED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(8);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='STORE' AND target_id=?",
                  Long.class,
                  store))
          .isEqualTo(1);
      assertThat(
              admin
                  .put(path, json(Map.of("suspended", false, "reason", "정상 운영 확인")), true)
                  .statusCode())
          .isEqualTo(204);
      assertThat(customer.get("/api/markets/" + market + "/offers/" + offer).statusCode())
          .isEqualTo(200);
    }
  }

  @Test
  void auditFailureRollsBackSuspensionAndAdminCancellation() throws Exception {
    var existing = order();
    String trigger = "phase5_audit_" + store;
    jdbc.execute(
        "CREATE FUNCTION "
            + trigger
            + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$");
    jdbc.execute(
        "CREATE TRIGGER "
            + trigger
            + " BEFORE INSERT ON administrator_changes FOR EACH ROW WHEN (NEW.target_id="
            + store
            + " OR NEW.target_id="
            + existing.id()
            + ") EXECUTE FUNCTION "
            + trigger
            + "()");
    try (var admin = session("fulfillment_admin")) {
      assertThat(
              admin
                  .put(
                      "/api/admin/stores/" + store + "/operation",
                      json(Map.of("suspended", true, "reason", "휴업 확인")),
                      true)
                  .statusCode())
          .isEqualTo(500);
      assertThat(
              jdbc.queryForObject("SELECT suspended FROM stores WHERE id=?", Boolean.class, store))
          .isFalse();
      assertThat(
              admin
                  .post(
                      "/api/admin/store-orders/" + existing.id() + "/cancellations",
                      json(
                          Map.of(
                              "requestKey",
                              "audit-fail",
                              "reasonType",
                              "STORE_FAULT",
                              "reason",
                              "제공 불가 확인")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(500);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM order_items WHERE store_order_id=? AND cancelled_at IS NOT NULL",
                  Long.class,
                  existing.id()))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, existing.id()))
          .isZero();
    } finally {
      jdbc.execute("DROP TRIGGER " + trigger + " ON administrator_changes");
      jdbc.execute("DROP FUNCTION " + trigger + "()");
    }
  }

  @Test
  void pickupAndAdministratorCancellationRaceHasOneTerminalOutcome() throws Exception {
    var existing = order();
    clock.set(Instant.parse("2026-10-13T05:00:00Z"));
    try (var merchant = session(seller);
        var admin = session("fulfillment_admin")) {
      var pickup =
          merchant.postAsync(
              sellerPath(existing.id()) + "/pickup", json(Map.of("code", existing.pickupCode())));
      var cancel =
          admin.postAsync(
              "/api/admin/store-orders/" + existing.id() + "/cancellations",
              json(
                  Map.of(
                      "requestKey", "race", "reasonType", "SERVICE_ERROR", "reason", "처리 오류 확인")));
      var statuses =
          java.util.List.of(
              pickup.get(30, TimeUnit.SECONDS).statusCode(),
              cancel.get(30, TimeUnit.SECONDS).statusCode());
      assertThat(statuses).containsExactlyInAnyOrder(200, 409);
      boolean picked =
          jdbc.queryForObject(
              "SELECT picked_up_at IS NOT NULL FROM store_orders WHERE id=?",
              Boolean.class,
              existing.id());
      long count =
          jdbc.queryForObject(
              "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, existing.id());
      assertThat(count).isEqualTo(picked ? 0 : 1);
    }
  }

  private HttpSessionClient session(String id) throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(
            client
                .login(id, id.equals("fulfillment_admin") ? "Admin1234!" : "Pass1234!")
                .statusCode())
        .isEqualTo(200);
    client.refreshCsrf();
    return client;
  }

  private static String json(Object value) {
    return new JsonMapper().writeValueAsString(value);
  }

  private static String buyerPath(long id) {
    return "/api/buyer/store-orders/" + id;
  }

  private String sellerPath(long id) {
    return "/api/seller/stores/" + store + "/orders/" + id;
  }

  private static String cancel(String key, String kind) {
    return json(Map.of("requestKey", key, "kind", kind));
  }

  @Test
  void generalCancellationRestoresOnceAndRefundCompletesOnce() throws Exception {
    var order = order();
    try (var client = session(buyer)) {
      String path = buyerPath(order.id()) + "/cancellations";
      assertThat(
              client
                  .post(path, cancel("cancel", "GENERAL"), "application/json", false)
                  .statusCode())
          .isEqualTo(403);
      assertThat(
              client.post(path, cancel("cancel", "GENERAL"), "application/json", true).statusCode())
          .isEqualTo(200);
      assertThat(
              client.post(path, cancel("cancel", "GENERAL"), "application/json", true).statusCode())
          .isEqualTo(200);
      assertThat(
              client
                  .post(path, cancel("cancel", "REMAINDER"), "application/json", true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(10);
      long refund =
          jdbc.queryForObject(
              "SELECT id FROM refunds WHERE store_order_id=?", Long.class, order.id());
      refunds.process(refund);
      refunds.process(refund);
      var body = client.json(client.get(buyerPath(order.id())));
      assertThat(body.get("status").asString()).isEqualTo("CANCELLED");
      assertThat(body.get("refundedWon").asString()).isEqualTo("3000");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, refund))
          .isEqualTo(1);
      assertThat(checkout.history(buyer).getFirst().status()).isEqualTo("CONFIRMED");
    }
  }

  @Test
  void failureAllowsRemainderCancellationAfterDeadlineWithoutRestoringInventory() throws Exception {
    var order = order();
    clock.set(Instant.parse("2026-10-13T04:00:00Z"));
    try (var customer = session(buyer);
        var merchant = session(seller)) {
      var response =
          merchant.post(
              sellerPath(order.id()) + "/failures",
              json(
                  Map.of(
                      "requestKey",
                      "failure",
                      "itemIds",
                      java.util.List.of(order.items().getFirst().id()),
                      "reason",
                      "물량 제공 불가")),
              "application/json",
              true);
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(
              customer
                  .post(
                      buyerPath(order.id()) + "/cancellations",
                      cancel("general", "GENERAL"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              customer
                  .post(
                      buyerPath(order.id()) + "/cancellations",
                      cancel("remaining", "REMAINDER"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, offer))
          .isEqualTo(8);
      assertThat(
              jdbc.queryForObject(
                  "SELECT sum(amount_won) FROM refunds WHERE store_order_id=?",
                  Long.class,
                  order.id()))
          .isEqualTo(3000);
    }
  }

  @Test
  void pickupRejectsWrongCodeAndTimeAndDoesNotExposeCodeToSeller() throws Exception {
    var order = order();
    try (var merchant = session(seller)) {
      var detail = merchant.json(merchant.get(sellerPath(order.id())));
      assertThat(detail.get("pickupCode").isNull()).isTrue();
      String path = sellerPath(order.id()) + "/pickup",
          body = json(Map.of("code", order.pickupCode()));
      assertThat(merchant.post(path, body, "application/json", true).statusCode()).isEqualTo(409);
      clock.set(Instant.parse("2026-10-13T05:00:00Z"));
      assertThat(merchant.post(path, body, "application/json", true).statusCode()).isEqualTo(200);
      clock.set(Instant.parse("2026-10-13T09:00:00Z"));
      assertThat(merchant.post(path, body, "application/json", true).statusCode()).isEqualTo(200);
      String wrong = order.pickupCode().equals("000000") ? "000001" : "000000";
      assertThat(
              merchant
                  .post(path, json(Map.of("code", wrong)), "application/json", true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              merchant
                  .post(
                      sellerPath(order.id()) + "/failures",
                      json(
                          Map.of(
                              "requestKey",
                              "fail",
                              "itemIds",
                              java.util.List.of(order.items().getFirst().id()),
                              "reason",
                              "제공 불가")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
    }
  }

  @Test
  void noShowRemainsUnrefundedButAdminCanHandleConfirmedStoreFault() throws Exception {
    var order = order();
    clock.set(Instant.parse("2026-10-13T09:00:00Z"));
    try (var customer = session(buyer);
        var merchant = session(seller);
        var admin = session("fulfillment_admin")) {
      assertThat(customer.json(customer.get(buyerPath(order.id()))).get("status").asString())
          .isEqualTo("NO_SHOW");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, order.id()))
          .isZero();
      assertThat(
              merchant
                  .post(
                      sellerPath(order.id()) + "/pickup",
                      json(Map.of("code", order.pickupCode())),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
      String path = "/api/admin/store-orders/" + order.id() + "/cancellations";
      assertThat(
              admin
                  .post(
                      path,
                      json(
                          Map.of(
                              "requestKey",
                              "late",
                              "reasonType",
                              "BUYER_REQUEST",
                              "reason",
                              "구매자 요청")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
      String body =
          json(Map.of("requestKey", "store-fault", "reasonType", "STORE_FAULT", "reason", "휴업 확인"));
      assertThat(admin.post(path, body, "application/json", true).statusCode()).isEqualTo(200);
      assertThat(admin.post(path, body, "application/json", true).statusCode()).isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='STORE_ORDER' AND target_id=?",
                  Long.class,
                  order.id()))
          .isEqualTo(1);
    }
  }

  @Test
  void refundFailureRetryAndLostResponseRecoverFromPersistentRecords() throws Exception {
    var order = order();
    try (var customer = session(buyer);
        var admin = session("fulfillment_admin")) {
      customer.post(
          buyerPath(order.id()) + "/cancellations",
          cancel("cancel", "GENERAL"),
          "application/json",
          true);
      long id =
          jdbc.queryForObject(
              "SELECT id FROM refunds WHERE store_order_id=?", Long.class, order.id());
      jdbc.update("UPDATE refunds SET mode='PERMANENT_FAILURE' WHERE id=?", id);
      refunds.process(id);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("NEEDS_ATTENTION");
      assertThat(
              admin
                  .post("/api/admin/refunds/" + id + "/retry", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(204);
      jdbc.update("UPDATE refunds SET mode='LOST_RESPONSE' WHERE id=?", id);
      refunds.process(id);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("PENDING");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, id))
          .isEqualTo(1);
      clock.set(Instant.parse("2026-10-13T03:00:02Z"));
      refunds.process(id);
      assertThat(jdbc.queryForObject("SELECT status FROM refunds WHERE id=?", String.class, id))
          .isEqualTo("COMPLETED");
      assertThat(
              admin
                  .post("/api/admin/refunds/" + id + "/retry", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(204);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM mock_refund_results WHERE refund_id=?", Long.class, id))
          .isEqualTo(1);
    }
  }

  @Test
  void duplicateConcurrentCancellationCreatesOneRefundAndUnauthorizedAccessIsBlocked()
      throws Exception {
    var order = order();
    try (var one = session(buyer);
        var two = session(buyer);
        var merchant = session(seller);
        var anonymous = new HttpSessionClient(port)) {
      assertThat(anonymous.get(buyerPath(order.id())).statusCode()).isEqualTo(401);
      assertThat(merchant.get(buyerPath(order.id())).statusCode()).isEqualTo(403);
      String path = buyerPath(order.id()) + "/cancellations", body = cancel("same-key", "GENERAL");
      var first = one.postAsync(path, body);
      var second = two.postAsync(path, body);
      assertThat(first.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
      assertThat(second.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM refunds WHERE store_order_id=?", Long.class, order.id()))
          .isEqualTo(1);
    }
  }
}
