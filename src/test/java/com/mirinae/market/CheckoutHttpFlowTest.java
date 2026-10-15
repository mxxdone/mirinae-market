package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class CheckoutHttpFlowTest {
  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ProductHttpFlowTest.TestClock clock;

  @Value("${local.server.port}")
  private int port;

  private String buyer;
  private String seller;
  private long market;
  private long store;
  private long otherStore;
  private long offer;
  private long otherOffer;

  @BeforeEach
  void fixtures() {
    clock.set(Instant.parse("2026-10-13T03:00:00Z"));
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    buyer = "u" + suffix;
    seller = "s" + suffix;
    accounts.ensureDemoAccount(buyer, "Pass1234!", "구매자", buyer + "@example.com", "BUYER");
    accounts.ensureDemoAccount(seller, "Pass1234!", "판매자", seller + "@example.com", "SELLER");
    var first = stores.ensureDemoStore(seller, "시장" + suffix, "첫매장");
    market = first.marketId();
    store = first.id();
    String second = "t" + suffix;
    accounts.ensureDemoAccount(second, "Pass1234!", "판매자", second + "@example.com", "SELLER");
    otherStore = stores.ensureDemoStore(second, "시장" + suffix, "둘째매장").id();
    offer = offer(store, 10, 1000);
    otherOffer = offer(otherStore, 5, 2000);
  }

  private long offer(long storeId, int quantity, int price) {
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00') ON CONFLICT DO NOTHING",
        storeId);
    long product =
        jdbc.queryForObject(
            "INSERT INTO products(store_id,name,unit_type,unit_amount) VALUES (?,'사과','COUNT',12) RETURNING id",
            Long.class,
            storeId);
    return jdbc.queryForObject(
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',?,?) RETURNING id",
        Long.class,
        storeId,
        product,
        price,
        quantity);
  }

  private HttpSessionClient session(String id) throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(client.login(id, "Pass1234!").statusCode()).isEqualTo(200);
    client.refreshCsrf();
    return client;
  }

  private long add(HttpSessionClient client, long id, int quantity) throws Exception {
    var response =
        client.put(
            "/api/buyer/cart/items/" + id,
            new tools.jackson.databind.json.JsonMapper()
                .writeValueAsString(java.util.Map.of("marketId", market, "quantity", quantity)),
            true);
    assertThat(response.statusCode()).isEqualTo(200);
    return client.json(response).get("version").asLong();
  }

  private static String payment(String key, long version, String mode) {
    return new tools.jackson.databind.json.JsonMapper()
        .writeValueAsString(
            java.util.Map.of("requestKey", key, "cartVersion", version, "mode", mode));
  }

  private JsonNode pay(HttpSessionClient client, String key, long version, String mode)
      throws Exception {
    var response =
        client.post("/api/buyer/checkouts", payment(key, version, mode), "application/json", true);
    assertThat(response.statusCode()).isEqualTo(200);
    return client.json(response);
  }

  private int stock(long id) {
    return jdbc.queryForObject(
        "SELECT online_quantity FROM daily_offers WHERE id=?", Integer.class, id);
  }

  @Test
  void multipleStoresConfirmAtomicallyAndDuplicateRequestsReturnSameSnapshot() throws Exception {
    try (var client = session(buyer)) {
      add(client, offer, 2);
      long version = add(client, otherOffer, 1);
      var result = pay(client, "multi", version, "SUCCESS");
      assertThat(result.get("status").asString()).isEqualTo("CONFIRMED");
      assertThat(result.get("totalWon").asLong()).isEqualTo(4000);
      assertThat(result.get("storeOrders").size()).isEqualTo(2);
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(stock(otherOffer)).isEqualTo(4);
      assertThat(pay(client, "multi", version, "SUCCESS").get("id").asLong())
          .isEqualTo(result.get("id").asLong());
      assertThat(stock(offer)).isEqualTo(8);
      jdbc.update("UPDATE daily_offers SET price_won=9999,active=false WHERE id=?", offer);
      var original = client.json(client.get("/api/buyer/checkouts/multi"));
      assertThat(original.get("storeOrders").get(0).get("items").get(0).get("priceWon").asInt())
          .isEqualTo(1000);
      clock.set(Instant.parse("2026-10-14T01:00:00Z"));
      assertThat(client.json(client.get("/api/buyer/checkouts/multi")).get("status").asString())
          .isEqualTo("CONFIRMED");
      assertThat(
              client
                  .post(
                      "/api/buyer/checkouts",
                      payment("multi", version, "FAIL"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(409);
    }
  }

  @Test
  void oneShortageLeavesAllOtherStockAndOrdersUntouched() throws Exception {
    try (var client = session(buyer)) {
      add(client, offer, 2);
      long version = add(client, otherOffer, 6);
      var result = pay(client, "shortage", version, "SUCCESS");
      assertThat(result.get("status").asString()).isEqualTo("FAILED");
      assertThat(result.get("errorCode").asString()).isEqualTo("OUT_OF_STOCK");
      assertThat(stock(offer)).isEqualTo(10);
      assertThat(stock(otherOffer)).isEqualTo(5);
      assertThat(result.get("storeOrders").size()).isZero();
    }
  }

  @Test
  void simultaneousBuyersHaveExactlyOneWinnerForLastItem() throws Exception {
    jdbc.update("UPDATE daily_offers SET online_quantity=1 WHERE id=?", offer);
    String another = buyer + "z";
    accounts.ensureDemoAccount(another, "Pass1234!", "구매자", another + "@example.com", "BUYER");
    try (var one = session(buyer);
        var two = session(another)) {
      long a = add(one, offer, 1);
      long b = add(two, offer, 1);
      var first = one.postAsync("/api/buyer/checkouts", payment("race-a", a, "SUCCESS"));
      var second = two.postAsync("/api/buyer/checkouts", payment("race-b", b, "SUCCESS"));
      var statuses =
          List.of(
              one.json(first.get()).get("status").asString(),
              two.json(second.get()).get("status").asString());
      assertThat(statuses).containsExactlyInAnyOrder("CONFIRMED", "FAILED");
      assertThat(stock(offer)).isZero();
    }
  }

  @Test
  void simultaneousIdenticalRequestCreatesOnlyOneOrder() throws Exception {
    try (var one = session(buyer);
        var two = session(buyer)) {
      long version = add(one, offer, 2);
      String body = payment("same-key", version, "SUCCESS");
      var a = one.postAsync("/api/buyer/checkouts", body);
      var b = two.postAsync("/api/buyer/checkouts", body);
      var first = one.json(a.get());
      var second = two.json(b.get());
      assertThat(first.get("status").asString()).isEqualTo("CONFIRMED");
      assertThat(second.get("id").asLong()).isEqualTo(first.get("id").asLong());
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM store_orders WHERE checkout_id=?",
                  Long.class,
                  first.get("id").asLong()))
          .isEqualTo(1);
    }
  }

  @Test
  void priceChangeRequiresExplicitConfirmationAndPaymentFailureDoesNotDeduct() throws Exception {
    try (var client = session(buyer)) {
      long version = add(client, offer, 2);
      jdbc.update("UPDATE daily_offers SET price_won=1500 WHERE id=?", offer);
      var changed = pay(client, "old-price", version, "SUCCESS");
      assertThat(changed.get("errorCode").asString()).isEqualTo("CONDITIONS_CHANGED");
      assertThat(stock(offer)).isEqualTo(10);
      assertThat(
              client
                  .json(client.get("/api/buyer/cart"))
                  .get("items")
                  .get(0)
                  .get("changed")
                  .asBoolean())
          .isTrue();
      long confirmed = add(client, offer, 2);
      var failed = pay(client, "payment-fail", confirmed, "FAIL");
      assertThat(failed.get("errorCode").asString()).isEqualTo("PAYMENT_FAILED");
      assertThat(stock(offer)).isEqualTo(10);
    }
  }

  @Test
  void delayedPaymentDoesNotReserveAndRechecksMidnightAndSuspension() throws Exception {
    try (var client = session(buyer)) {
      long version = add(client, offer, 2);
      var pending = pay(client, "delayed", version, "DELAY");
      assertThat(pending.get("status").asString()).isEqualTo("PENDING");
      assertThat(stock(offer)).isEqualTo(10);
      jdbc.update("UPDATE daily_offers SET active=false WHERE id=?", offer);
      clock.set(Instant.parse("2026-10-13T03:00:04Z"));
      var result = awaitResult(client, "delayed");
      assertThat(result.get("status").asString()).isEqualTo("FAILED");
      assertThat(stock(offer)).isEqualTo(10);
      jdbc.update("UPDATE daily_offers SET active=true WHERE id=?", offer);
      long next = add(client, offer, 2);
      assertThat(pay(client, "midnight", next, "DELAY").get("status").asString())
          .isEqualTo("PENDING");
      clock.set(Instant.parse("2026-10-14T00:00:00Z"));
      assertThat(awaitResult(client, "midnight").get("status").asString()).isEqualTo("FAILED");
      assertThat(stock(offer)).isEqualTo(10);
    }
  }

  private JsonNode awaitResult(HttpSessionClient client, String key) throws Exception {
    JsonNode result = null;
    for (int i = 0; i < 100; i++) {
      result = client.json(client.get("/api/buyer/checkouts/" + key));
      if (!result.get("status").asString().equals("PENDING")) return result;
      java.util.concurrent.locks.LockSupport.parkNanos(20_000_000L);
    }
    throw new AssertionError("결제 결과가 수렴하지 않았습니다: " + result);
  }

  @Test
  void responseLossKeepsSuccessfulOrderAndAuthorizationsAreEnforced() throws Exception {
    try (var client = session(buyer);
        var sellerClient = session(seller);
        var anonymous = new HttpSessionClient(port)) {
      long version = add(client, offer, 2);
      assertThat(
              client
                  .post(
                      "/api/buyer/checkouts",
                      payment("lost", version, "LOST_RESPONSE"),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(503);
      var result = client.json(client.get("/api/buyer/checkouts/lost"));
      assertThat(result.get("status").asString()).isEqualTo("CONFIRMED");
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(pay(client, "lost", version, "LOST_RESPONSE").get("id").asLong())
          .isEqualTo(result.get("id").asLong());
      assertThat(sellerClient.get("/api/buyer/orders").statusCode()).isEqualTo(403);
      assertThat(anonymous.get("/api/buyer/orders").statusCode()).isEqualTo(401);
      assertThat(
              client
                  .post(
                      "/api/buyer/checkouts",
                      payment("no-csrf", version, "SUCCESS"),
                      "application/json",
                      false)
                  .statusCode())
          .isEqualTo(403);
    }
  }

  @Test
  void staleSellerQuantityCannotOverwriteOrderAndPickupTimeIsLocked() throws Exception {
    try (var client = session(buyer);
        var sellerClient = session(seller)) {
      long product =
          jdbc.queryForObject("SELECT product_id FROM daily_offers WHERE id=?", Long.class, offer);
      long version = add(client, offer, 2);
      pay(client, "seller-stock", version, "SUCCESS");
      String path = "/api/seller/stores/" + store + "/sales/2026-10-13";
      String body =
          new tools.jackson.databind.json.JsonMapper()
              .writeValueAsString(
                  java.util.Map.of(
                      "startTime",
                      "14:00",
                      "endTime",
                      "18:00",
                      "orderDeadline",
                      "13:00",
                      "products",
                      List.of(
                          java.util.Map.of(
                              "productId",
                              product,
                              "selling",
                              true,
                              "priceWon",
                              1000,
                              "onlineQuantity",
                              10,
                              "inventoryVersion",
                              0))));
      assertThat(sellerClient.put(path, body, true).statusCode()).isEqualTo(409);
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(
              sellerClient
                  .put(
                      path,
                      body.replace("\"inventoryVersion\":0", "\"inventoryVersion\":1")
                          .replace("14:00", "15:00"),
                      true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(
              sellerClient
                  .put(
                      path,
                      body.replace("\"inventoryVersion\":0", "\"inventoryVersion\":1")
                          .replace("\"onlineQuantity\":10", "\"onlineQuantity\":8"),
                      true)
                  .statusCode())
          .isEqualTo(204);
    }
  }

  @Test
  void deletedOfferAndDeadlineBoundaryFailWithoutCharging() throws Exception {
    try (var client = session(buyer)) {
      long version = add(client, offer, 1);
      jdbc.update(
          "UPDATE products SET archived_at=CURRENT_TIMESTAMP WHERE id=(SELECT product_id FROM daily_offers WHERE id=?)",
          offer);
      assertThat(pay(client, "deleted", version, "SUCCESS").get("errorCode").asString())
          .isEqualTo("OFFER_UNAVAILABLE");
      assertThat(stock(offer)).isEqualTo(10);
      long next = add(client, otherOffer, 1);
      clock.set(Instant.parse("2026-10-13T04:00:00Z"));
      assertThat(pay(client, "deadline", next, "SUCCESS").get("status").asString())
          .isEqualTo("FAILED");
      assertThat(stock(otherOffer)).isEqualTo(5);
    }
  }

  @Test
  void storageFailureRollsBackEveryStockOrderAndTimeLockThenRecovers() throws Exception {
    try (var client = session(buyer)) {
      add(client, offer, 2);
      long version = add(client, otherOffer, 1);
      String trigger = "reject_checkout_" + offer;
      jdbc.execute(
          "CREATE FUNCTION "
              + trigger
              + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.offer_id = "
              + otherOffer
              + " THEN RAISE EXCEPTION '의도한 주문 저장 실패'; END IF; RETURN NEW; END $$");
      jdbc.execute(
          "CREATE TRIGGER "
              + trigger
              + " BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION "
              + trigger
              + "()");
      try {
        assertThat(
                client
                    .post(
                        "/api/buyer/checkouts",
                        payment("storage-error", version, "SUCCESS"),
                        "application/json",
                        true)
                    .statusCode())
            .isEqualTo(500);
        assertThat(stock(offer)).isEqualTo(10);
        assertThat(stock(otherOffer)).isEqualTo(5);
        assertThat(
                jdbc.queryForObject(
                    "SELECT orders_locked FROM pickup_windows WHERE store_id=? AND pickup_date='2026-10-13'",
                    Boolean.class,
                    store))
            .isFalse();
        long id = client.json(client.get("/api/buyer/checkouts/storage-error")).get("id").asLong();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM store_orders WHERE checkout_id=?", Long.class, id))
            .isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM checkouts WHERE id=?", String.class, id))
            .isEqualTo("PENDING");
      } finally {
        jdbc.execute("DROP TRIGGER " + trigger + " ON order_items");
        jdbc.execute("DROP FUNCTION " + trigger + "()");
      }
      assertThat(awaitResult(client, "storage-error").get("status").asString())
          .isEqualTo("CONFIRMED");
      assertThat(stock(offer)).isEqualTo(8);
      assertThat(stock(otherOffer)).isEqualTo(4);
    }
  }

  @Test
  void sellerSaveAndCheckoutShareLocksAndCannotResurrectStock() throws Exception {
    try (var client = session(buyer);
        var sellerClient = session(seller)) {
      long version = add(client, offer, 2);
      long product =
          jdbc.queryForObject("SELECT product_id FROM daily_offers WHERE id=?", Long.class, offer);
      String body =
          new tools.jackson.databind.json.JsonMapper()
              .writeValueAsString(
                  java.util.Map.of(
                      "startTime",
                      "14:00",
                      "endTime",
                      "18:00",
                      "orderDeadline",
                      "13:00",
                      "products",
                      List.of(
                          java.util.Map.of(
                              "productId",
                              product,
                              "selling",
                              true,
                              "priceWon",
                              1000,
                              "onlineQuantity",
                              10,
                              "inventoryVersion",
                              0))));
      var saving = sellerClient.putAsync("/api/seller/stores/" + store + "/sales/2026-10-13", body);
      var buying =
          client.postAsync("/api/buyer/checkouts", payment("seller-race", version, "SUCCESS"));
      assertThat(client.json(buying.get()).get("status").asString()).isEqualTo("CONFIRMED");
      assertThat(saving.get().statusCode()).isIn(204, 409);
      assertThat(stock(offer)).isEqualTo(8);
    }
  }

  @Test
  void crossMarketAndOtherBuyerAccessAndInvalidCartInputsAreRejected() throws Exception {
    String outsider = buyer + "x";
    accounts.ensureDemoAccount(outsider, "Pass1234!", "구매자", outsider + "@example.com", "BUYER");
    String foreignSeller = seller + "x";
    accounts.ensureDemoAccount(
        foreignSeller, "Pass1234!", "판매자", foreignSeller + "@example.com", "SELLER");
    var foreign = stores.ensureDemoStore(foreignSeller, "다른시장" + buyer, "타시장매장");
    long id = offer(foreign.id(), 5, 1000);
    try (var client = session(buyer);
        var other = session(outsider)) {
      long version = add(client, offer, 1);
      pay(client, "private", version, "SUCCESS");
      assertThat(other.get("/api/buyer/checkouts/private").statusCode()).isEqualTo(404);
      for (String body :
          List.of(
              "{}",
              "{\"marketId\":" + market + ",\"quantity\":0}",
              "{\"marketId\":" + market + ",\"quantity\":1.5}"))
        assertThat(client.put("/api/buyer/cart/items/" + offer, body, true).statusCode())
            .isEqualTo(400);
      assertThat(
              client
                  .put(
                      "/api/buyer/cart/items/" + id,
                      "{\"marketId\":" + market + ",\"quantity\":1}",
                      true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(client.json(client.get("/api/buyer/cart")).get("items").size()).isZero();
    }
  }
}
