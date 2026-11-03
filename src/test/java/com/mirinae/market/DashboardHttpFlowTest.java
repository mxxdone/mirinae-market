package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.checkout.business.RefundService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"mirinae.refund.recovery.enabled=false"})
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class DashboardHttpFlowTest {
  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private CheckoutService checkout;
  @Autowired private RefundService refunds;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ProductHttpFlowTest.TestClock clock;

  @Value("${local.server.port}")
  private int port;

  private String buyerA;
  private String buyerB;
  private String buyerC;
  private String seller;
  private String otherSeller;
  private long store;
  private long otherStore;
  private long apple;
  private long pear;

  @BeforeEach
  void fixtures() {
    clock.set(Instant.parse("2026-10-13T03:00:00Z"));
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    buyerA = "a" + suffix;
    buyerB = "b" + suffix;
    buyerC = "c" + suffix;
    seller = "s" + suffix;
    otherSeller = "o" + suffix;
    accounts.ensureDemoAccount(buyerA, "Pass1234!", "구매자", buyerA + "@example.com", "BUYER");
    accounts.ensureDemoAccount(buyerB, "Pass1234!", "구매자", buyerB + "@example.com", "BUYER");
    accounts.ensureDemoAccount(buyerC, "Pass1234!", "구매자", buyerC + "@example.com", "BUYER");
    accounts.ensureDemoAccount(seller, "Pass1234!", "판매자", seller + "@example.com", "SELLER");
    accounts.ensureDemoAccount(
        otherSeller, "Pass1234!", "판매자", otherSeller + "@example.com", "SELLER");
    store = stores.ensureDemoStore(seller, "대시보드시장" + suffix, "대시보드매장").id();
    otherStore = stores.ensureDemoStore(otherSeller, "대시보드시장" + suffix, "다른매장").id();
    for (String date : new String[] {"2026-10-13", "2026-10-31", "2026-11-01"}) {
      window(store, date);
      window(otherStore, date);
    }
    apple = product(store, "사과", "COUNT", 1, 1000);
    pear = product(store, "배", "WEIGHT", 500, 3000);
  }

  private void window(long target, String date) {
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,?, '14:00','18:00','13:00') ON CONFLICT DO NOTHING",
        target,
        LocalDate.parse(date));
  }

  private long product(long target, String name, String unitType, int amount, int price) {
    long id =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,?,?,?) RETURNING id",
            Long.class,
            target,
            name,
            unitType,
            amount);
    jdbc.update(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',?,100)",
        target,
        id,
        price);
    return id;
  }

  private long otherOffer(long target, String name, int price) {
    long id =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,?,'COUNT',1) RETURNING id",
            Long.class,
            target,
            name);
    jdbc.update(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',?,100)",
        target,
        id,
        price);
    return id;
  }

  @Test
  void dailyStatusesPreparationAndLifetimeMatchSpecFixture() throws Exception {
    long waiting = order(buyerA, "waiting", 4000, "CONFIRMED", "2026-10-13T00:00:00Z");
    item(waiting, apple, "사과", "COUNT", 1, 1000, 1);
    item(waiting, pear, "배", "WEIGHT", 500, 3000, 1);

    long partial = order(buyerA, "partial", 4000, "CONFIRMED", "2026-10-13T01:00:00Z");
    long partialItem = item(partial, apple, "사과", "COUNT", 1, 1000, 1);
    item(partial, pear, "배", "WEIGHT", 500, 3000, 1);
    cancel(partialItem, buyerA);
    refund(partial, 1000, "COMPLETED");

    long picked = order(buyerB, "picked", 1000, "CONFIRMED", "2026-10-13T02:00:00Z");
    item(picked, apple, "사과", "COUNT", 1, 1000, 1);
    jdbc.update(
        "UPDATE store_orders SET picked_up_at=? WHERE id=?",
        timestamp("2026-10-13T02:30:00Z"),
        picked);

    long cancelled = order(buyerC, "cancelled", 1000, "CONFIRMED", "2026-10-13T03:00:00Z");
    long cancelledItem = item(cancelled, apple, "사과", "COUNT", 1, 1000, 1);
    cancel(cancelledItem, buyerC);
    refund(cancelled, 1000, "COMPLETED");

    long pending = order(buyerA, "pending", 5000, "PENDING", null);
    item(pending, apple, "사과", "COUNT", 1, 1000, 5);
    long failed = order(buyerB, "failed", 3000, "FAILED", null);
    item(failed, pear, "배", "WEIGHT", 500, 3000, 1);
    long foreign = order(otherSeller, "foreign", 9000, "CONFIRMED", "2026-10-13T03:00:00Z");
    long foreignOffer = otherOffer(otherStore, "타매장상품", 9000);
    item(foreign, foreignOffer, "타매장상품", "COUNT", 1, 9000, 1);

    try (var client = session(seller)) {
      var response = client.get(path() + "?date=2026-10-13&month=2026-10");
      assertThat(response.statusCode()).isEqualTo(200);
      JsonNode body = client.json(response);

      assertThat(body.get("asOf").asString()).isEqualTo("2026-10-13T03:00:00Z");
      assertThat(body.get("date").asString()).isEqualTo("2026-10-13");
      assertThat(body.get("month").asString()).isEqualTo("2026-10");

      JsonNode daily = body.get("daily");
      assertThat(daily.get("totalOrders").asLong()).isEqualTo(4);
      assertThat(daily.get("waitingOrders").asLong()).isEqualTo(2);
      assertThat(daily.get("pickedUpOrders").asLong()).isEqualTo(1);
      assertThat(daily.get("noShowOrders").asLong()).isZero();
      assertThat(daily.get("cancelledOrders").asLong()).isEqualTo(1);
      assertThat(daily.get("partiallyCancelledOrders").asLong()).isEqualTo(1);
      assertThat(
              daily.get("waitingOrders").asLong()
                  + daily.get("pickedUpOrders").asLong()
                  + daily.get("noShowOrders").asLong()
                  + daily.get("cancelledOrders").asLong())
          .isEqualTo(daily.get("totalOrders").asLong());

      var items = body.get("preparationItems");
      assertThat(items).hasSize(2);
      assertThat(items.get(0).get("productName").asString()).isEqualTo("배");
      assertThat(items.get(0).get("productId").asLong()).isEqualTo(pear);
      assertThat(items.get(0).get("unitType").asString()).isEqualTo("WEIGHT");
      assertThat(items.get(0).get("unitAmount").asInt()).isEqualTo(500);
      assertThat(items.get(0).get("quantity").asLong()).isEqualTo(2);
      assertThat(items.get(1).get("productName").asString()).isEqualTo("사과");
      assertThat(items.get(1).get("quantity").asLong()).isEqualTo(1);

      JsonNode lifetime = body.get("lifetime");
      assertThat(lifetime.get("orderCount").asLong()).isEqualTo(3);
      assertThat(lifetime.get("buyerCount").asLong()).isEqualTo(2);
      assertThat(lifetime.get("paymentWon").asString()).isEqualTo("10000");
      assertThat(lifetime.get("refundWon").asString()).isEqualTo("2000");
      assertThat(lifetime.get("netWon").asString()).isEqualTo("8000");

      JsonNode monthly = body.get("monthly");
      assertThat(monthly.get("paymentWon").asString()).isEqualTo("10000");
      assertThat(monthly.get("refundWon").asString()).isEqualTo("2000");
      assertThat(monthly.get("netWon").asString()).isEqualTo("8000");
    }
  }

  @Test
  void preparationExcludesPickedCancelledAndNoShowOrders() throws Exception {
    long waiting = order(buyerA, "prep-waiting", 2000, "CONFIRMED", "2026-10-13T00:00:00Z");
    item(waiting, apple, "사과", "COUNT", 1, 1000, 2);

    long picked = order(buyerB, "prep-picked", 1000, "CONFIRMED", "2026-10-13T00:30:00Z");
    item(picked, apple, "사과", "COUNT", 1, 1000, 1);
    jdbc.update(
        "UPDATE store_orders SET picked_up_at=? WHERE id=?",
        timestamp("2026-10-13T02:30:00Z"),
        picked);

    long cancelled = order(buyerC, "prep-cancelled", 1000, "CONFIRMED", "2026-10-13T01:00:00Z");
    long cancelledItem = item(cancelled, apple, "사과", "COUNT", 1, 1000, 1);
    cancel(cancelledItem, buyerC);

    try (var client = session(seller)) {
      var body = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(body.get("preparationItems")).hasSize(1);
      assertThat(body.get("preparationItems").get(0).get("quantity").asLong()).isEqualTo(2);
      assertThat(body.get("daily").get("noShowOrders").asLong()).isZero();

      clock.set(Instant.parse("2026-10-13T09:00:00Z"));
      var atEnd = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(atEnd.get("preparationItems")).isEmpty();
      assertThat(atEnd.get("daily").get("noShowOrders").asLong()).isEqualTo(1);
      assertThat(atEnd.get("daily").get("waitingOrders").asLong()).isZero();
      assertThat(atEnd.get("daily").get("totalOrders").asLong()).isEqualTo(3);

      clock.set(Instant.parse("2026-10-13T08:59:59Z"));
      var beforeEnd = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(beforeEnd.get("preparationItems")).hasSize(1);
      assertThat(beforeEnd.get("daily").get("waitingOrders").asLong()).isEqualTo(1);
      assertThat(beforeEnd.get("daily").get("noShowOrders").asLong()).isZero();
    }
  }

  @Test
  void partiallyCancelledOrderKeepsStatusAndPreparationOfRemainingItem() throws Exception {
    long order = order(buyerA, "partial-prep", 4000, "CONFIRMED", "2026-10-13T00:00:00Z");
    long appleItem = item(order, apple, "사과", "COUNT", 1, 1000, 1);
    item(order, pear, "배", "WEIGHT", 500, 3000, 2);
    cancel(appleItem, buyerA);

    try (var client = session(seller)) {
      var body = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(body.get("daily").get("waitingOrders").asLong()).isEqualTo(1);
      assertThat(body.get("daily").get("cancelledOrders").asLong()).isZero();
      assertThat(body.get("daily").get("partiallyCancelledOrders").asLong()).isEqualTo(1);
      assertThat(body.get("preparationItems")).hasSize(1);
      assertThat(body.get("preparationItems").get(0).get("productName").asString()).isEqualTo("배");
      assertThat(body.get("preparationItems").get(0).get("quantity").asLong()).isEqualTo(2);
      assertThat(body.get("lifetime").get("orderCount").asLong()).isEqualTo(1);
      assertThat(body.get("lifetime").get("paymentWon").asString()).isEqualTo("7000");
    }
  }

  @Test
  void completedRefundOnlyIsDeductedAndIsNotMultipliedByItems() throws Exception {
    long order = order(buyerA, "refunds", 3000, "CONFIRMED", "2026-10-13T00:00:00Z");
    long third = otherOffer(store, "귤", 1000);
    long first = item(order, apple, "사과", "COUNT", 1, 1000, 1);
    long second = item(order, pear, "배", "WEIGHT", 500, 3000, 1);
    item(order, third, "귤", "COUNT", 1, 1000, 1);
    cancel(first, buyerA);
    cancel(second, buyerA);
    refund(order, 1000, "COMPLETED");
    refund(order, 3000, "PENDING");
    refund(order, 1000, "NEEDS_ATTENTION");

    try (var client = session(seller)) {
      var body = client.json(client.get(path()));
      assertThat(body.get("lifetime").get("paymentWon").asString()).isEqualTo("5000");
      assertThat(body.get("lifetime").get("refundWon").asString()).isEqualTo("1000");
      assertThat(body.get("lifetime").get("netWon").asString()).isEqualTo("4000");
      assertThat(body.get("monthly").get("refundWon").asString()).isEqualTo("1000");
      assertThat(body.get("daily").get("cancelledOrders").asLong()).isZero();
      assertThat(body.get("daily").get("waitingOrders").asLong()).isEqualTo(1);
    }
  }

  @Test
  void monthlyAmountsFollowKoreanPaymentMonthAndCompletedRefundMonthAttribution() throws Exception {
    long october = order(buyerA, "october", 10000, "CONFIRMED", "2026-10-31T14:59:59Z");
    item(october, apple, "사과", "COUNT", 1, 10000, 1);
    long november = order(buyerB, "november", 5000, "CONFIRMED", "2026-10-31T15:00:00Z");
    item(november, apple, "사과", "COUNT", 1, 5000, 1);
    clock.set(Instant.parse("2026-11-01T00:00:00Z"));
    refund(october, 3000, "COMPLETED");
    refund(october, 2000, "PENDING");

    clock.set(Instant.parse("2026-11-15T03:00:00Z"));
    try (var client = session(seller)) {
      var octoberBody = client.json(client.get(path() + "?month=2026-10"));
      assertThat(octoberBody.get("monthly").get("paymentWon").asString()).isEqualTo("10000");
      assertThat(octoberBody.get("monthly").get("refundWon").asString()).isEqualTo("3000");
      assertThat(octoberBody.get("monthly").get("netWon").asString()).isEqualTo("7000");
      assertThat(octoberBody.get("lifetime").get("paymentWon").asString()).isEqualTo("15000");
      assertThat(octoberBody.get("date").asString()).isEqualTo("2026-11-15");

      var novemberBody = client.json(client.get(path() + "?month=2026-11"));
      assertThat(novemberBody.get("monthly").get("paymentWon").asString()).isEqualTo("5000");
      assertThat(novemberBody.get("monthly").get("refundWon").asString()).isEqualTo("0");

      var farMonth = client.json(client.get(path() + "?month=9999-12"));
      assertThat(farMonth.get("monthly").get("paymentWon").asString()).isEqualTo("0");
      assertThat(farMonth.get("monthly").get("netWon").asString()).isEqualTo("0");
    }
  }

  @Test
  void deletedInactiveAndSuspendedCatalogDoesNotRemoveHistory() throws Exception {
    long order = order(buyerA, "archived", 4000, "CONFIRMED", "2026-10-13T00:00:00Z");
    item(order, apple, "사과", "COUNT", 1, 1000, 1);
    item(order, pear, "배", "WEIGHT", 500, 3000, 1);
    jdbc.update("UPDATE products SET archived_at=now() WHERE store_id=?", store);
    jdbc.update("UPDATE daily_offers SET active=false WHERE store_id=?", store);
    jdbc.update("UPDATE stores SET suspended=true WHERE id=?", store);

    try (var client = session(seller)) {
      var body = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(body.get("daily").get("waitingOrders").asLong()).isEqualTo(1);
      assertThat(body.get("preparationItems")).hasSize(2);
      assertThat(body.get("lifetime").get("paymentWon").asString()).isEqualTo("4000");
      assertThat(body.get("lifetime").get("orderCount").asLong()).isEqualTo(1);
    }
  }

  @Test
  void emptyStoreAndOrderlessDateReturnZeroWithoutError() throws Exception {
    try (var client = session(seller)) {
      var empty = client.get(path() + "?date=2026-10-13&month=2026-10");
      assertThat(empty.statusCode()).isEqualTo(200);
      JsonNode body = client.json(empty);
      assertThat(body.get("daily").get("totalOrders").asLong()).isZero();
      assertThat(body.get("preparationItems")).isEmpty();
      assertThat(body.get("lifetime").get("orderCount").asLong()).isZero();
      assertThat(body.get("lifetime").get("buyerCount").asLong()).isZero();
      assertThat(body.get("lifetime").get("paymentWon").asString()).isEqualTo("0");
      assertThat(body.get("lifetime").get("netWon").asString()).isEqualTo("0");
      assertThat(body.get("monthly").get("paymentWon").asString()).isEqualTo("0");
    }
  }

  @Test
  void defaultsUseKoreanTodayAndCurrentMonth() throws Exception {
    try (var client = session(seller)) {
      var body = client.json(client.get(path()));
      assertThat(body.get("date").asString()).isEqualTo("2026-10-13");
      assertThat(body.get("month").asString()).isEqualTo("2026-10");
      assertThat(body.get("asOf").asString()).isEqualTo("2026-10-13T03:00:00Z");
      assertThat(body.get("lifetime").get("paymentWon").asString()).isEqualTo("0");
    }
  }

  @Test
  void rejectsInvalidDateAndMonthAndEnforcesStoreOwnership() throws Exception {
    try (var client = session(seller)) {
      for (String query :
          new String[] {
            "?date=2026-1-01",
            "?date=2026-13-01",
            "?date=2026-02-30",
            "?date=0000-01-01",
            "?date=2026-10-13T00:00",
            "?month=2026-1",
            "?month=2026-13",
            "?month=0000-01",
            "?month=2026-10-01"
          }) {
        assertThat(client.get(path() + query).statusCode()).as(query).isEqualTo(400);
      }
      assertThat(client.get("/api/seller/stores/" + otherStore + "/dashboard").statusCode())
          .isEqualTo(403);
    }
    try (var anonymous = new HttpSessionClient(port)) {
      assertThat(anonymous.get(path()).statusCode()).isEqualTo(401);
    }
    try (var customer = session(buyerA)) {
      assertThat(customer.get(path()).statusCode()).isEqualTo(403);
    }
    try (var other = session(otherSeller)) {
      assertThat(other.get(path()).statusCode()).isEqualTo(403);
      assertThat(other.get(path()).body()).doesNotContain("대시보드매장");
    }
  }

  @Test
  void realCheckoutCancellationPickupAndRefundAreReflectedOnRequery() throws Exception {
    long firstOffer = offer("실시간상품", 2000);
    long secondOffer = offer("실시간상품2", 1000);
    checkout.put(buyerA, storeMarket(), firstOffer, 2);
    var cart = checkout.put(buyerA, storeMarket(), secondOffer, 1);
    long cancelledOrder =
        checkout
            .start(buyerA, UUID.randomUUID().toString(), cart.version(), "SUCCESS")
            .checkout()
            .storeOrders()
            .getFirst()
            .id();

    checkout.put(buyerB, storeMarket(), firstOffer, 1);
    long pickedOrder =
        checkout
            .start(buyerB, UUID.randomUUID().toString(), checkout.cart(buyerB).version(), "SUCCESS")
            .checkout()
            .storeOrders()
            .getFirst()
            .id();

    try (var client = session(seller)) {
      var before = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(before.get("daily").get("waitingOrders").asLong()).isEqualTo(2);
      assertThat(before.get("lifetime").get("paymentWon").asString()).isEqualTo("7000");
      assertThat(before.get("lifetime").get("refundWon").asString()).isEqualTo("0");
      assertThat(before.get("preparationItems")).hasSize(2);
      assertThat(client.json(client.get(sellerOrderPath(pickedOrder))).get("pickupCode").isNull())
          .isTrue();
    }

    try (var customer = session(buyerA)) {
      var cancelled =
          customer.post(
              "/api/buyer/store-orders/" + cancelledOrder + "/cancellations",
              json(Map.of("requestKey", "phase6-real-cancel", "kind", "GENERAL")),
              "application/json",
              true);
      assertThat(cancelled.statusCode()).isEqualTo(200);
    }

    try (var client = session(seller)) {
      var pendingRefund = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(pendingRefund.get("daily").get("cancelledOrders").asLong()).isEqualTo(1);
      assertThat(pendingRefund.get("preparationItems")).hasSize(1);
      assertThat(pendingRefund.get("lifetime").get("orderCount").asLong()).isEqualTo(1);
      assertThat(pendingRefund.get("lifetime").get("buyerCount").asLong()).isEqualTo(1);
      assertThat(pendingRefund.get("lifetime").get("paymentWon").asString()).isEqualTo("7000");
      assertThat(pendingRefund.get("lifetime").get("refundWon").asString()).isEqualTo("0");
      assertThat(pendingRefund.get("lifetime").get("netWon").asString()).isEqualTo("7000");
    }

    long refundId =
        jdbc.queryForObject(
            "SELECT id FROM refunds WHERE store_order_id=?", Long.class, cancelledOrder);
    refunds.process(refundId);

    try (var client = session(seller)) {
      var completed = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(completed.get("lifetime").get("refundWon").asString()).isEqualTo("5000");
      assertThat(completed.get("lifetime").get("netWon").asString()).isEqualTo("2000");
      assertThat(completed.get("monthly").get("refundWon").asString()).isEqualTo("5000");

      String code =
          jdbc.queryForObject(
              "SELECT pickup_code FROM store_orders WHERE id=?", String.class, pickedOrder);
      clock.set(Instant.parse("2026-10-13T05:00:00Z"));
      var picked =
          client.post(
              "/api/seller/stores/" + store + "/orders/" + pickedOrder + "/pickup",
              json(Map.of("code", code)),
              "application/json",
              true);
      assertThat(picked.statusCode()).isEqualTo(200);
      var afterPickup = client.json(client.get(path() + "?date=2026-10-13"));
      assertThat(afterPickup.get("daily").get("pickedUpOrders").asLong()).isEqualTo(1);
      assertThat(afterPickup.get("preparationItems")).isEmpty();
      assertThat(afterPickup.get("lifetime").get("orderCount").asLong()).isEqualTo(1);
      assertThat(afterPickup.get("lifetime").get("buyerCount").asLong()).isEqualTo(1);
    }
  }

  private long storeMarket() {
    return jdbc.queryForObject("SELECT market_id FROM stores WHERE id=?", Long.class, store);
  }

  private long offer(String name, int price) {
    long product =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,?,'COUNT',1) RETURNING id",
            Long.class,
            store,
            name);
    return jdbc.queryForObject(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',?,10) RETURNING id",
        Long.class,
        store,
        product,
        price);
  }

  private long order(
      String buyerOrSeller, String key, long total, String status, String confirmedAt) {
    long buyer =
        jdbc.queryForObject("SELECT id FROM accounts WHERE login_id=?", Long.class, buyerOrSeller);
    long checkout =
        jdbc.queryForObject(
            "INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,total_won,due_at,created_at,confirmed_at) VALUES (?,?,?,'SUCCESS',?,?,?,?,?) RETURNING id",
            Long.class,
            buyer,
            key + UUID.randomUUID(),
            Math.abs(key.hashCode()),
            status,
            total,
            timestamp("2099-01-01T00:00:00Z"),
            timestamp("2026-10-13T00:00:00Z"),
            confirmedAt == null ? null : timestamp(confirmedAt));
    long storeId = buyerOrSeller.equals(otherSeller) ? otherStore : store;
    String date =
        confirmedAt != null && confirmedAt.startsWith("2026-10-31") ? "2026-10-31" : "2026-10-13";
    if (confirmedAt != null
        && confirmedAt.startsWith("2026-10-31")
        && confirmedAt.endsWith("15:00:00Z")) date = "2026-11-01";
    return jdbc.queryForObject(
        "INSERT INTO store_orders(checkout_id,store_id,market_id,store_name,pickup_date,start_time,end_time,order_deadline,pickup_code) VALUES (?,?,(SELECT market_id FROM stores WHERE id=?),'대시보드매장',?,'14:00','18:00','13:00',lpad((floor(random()*1000000))::text,6,'0')) RETURNING id",
        Long.class,
        checkout,
        storeId,
        storeId,
        LocalDate.parse(date));
  }

  private long item(
      long order,
      long offerId,
      String name,
      String unitType,
      int unitAmount,
      int price,
      int quantity) {
    return jdbc.queryForObject(
        "INSERT INTO order_items(store_order_id,offer_id,product_name,unit_type,unit_amount,price_won,quantity) VALUES (?,?,?,?,?,?,?) RETURNING id",
        Long.class,
        order,
        offerId,
        name,
        unitType,
        unitAmount,
        price,
        quantity);
  }

  private void cancel(long item, String actor) {
    jdbc.update(
        "UPDATE order_items SET cancelled_at=?,cancellation_type='GENERAL',cancellation_reason='취소',cancelled_by=(SELECT id FROM accounts WHERE login_id=?) WHERE id=?",
        timestamp("2026-10-13T02:30:00Z"),
        actor,
        item);
  }

  private void refund(long order, long amount, String status) {
    Timestamp requestedAt = Timestamp.from(clock.instant());
    long actor =
        jdbc.queryForObject("SELECT id FROM accounts WHERE login_id=?", Long.class, buyerA);
    long operation =
        jdbc.queryForObject(
            "INSERT INTO order_operations(actor_id,request_key,store_order_id,fingerprint,created_at) VALUES (?,?,?,?,?) RETURNING id",
            Long.class,
            actor,
            "op" + UUID.randomUUID(),
            order,
            "phase6",
            requestedAt);
    jdbc.update(
        "INSERT INTO refunds(operation_id,store_order_id,amount_won,status,mode,attempts,due_at,created_at,completed_at) VALUES (?,?,?,?,'SUCCESS',1,?,?,?)",
        operation,
        order,
        amount,
        status,
        requestedAt,
        requestedAt,
        status.equals("COMPLETED") ? requestedAt : null);
  }

  private static Timestamp timestamp(String instant) {
    return Timestamp.from(Instant.parse(instant));
  }

  private String path() {
    return "/api/seller/stores/" + store + "/dashboard";
  }

  private String sellerOrderPath(long order) {
    return "/api/seller/stores/" + store + "/orders/" + order;
  }

  private static String json(Object value) {
    return JsonMapper.builder().build().writeValueAsString(value);
  }

  private HttpSessionClient session(String id) throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(client.login(id, "Pass1234!").statusCode()).isEqualTo(200);
    client.refreshCsrf();
    return client;
  }
}
