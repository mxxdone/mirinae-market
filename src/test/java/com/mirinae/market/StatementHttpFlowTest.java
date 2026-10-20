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
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
      "admin.bootstrap.login-id=statement_admin", "admin.bootstrap.password=Admin1234!",
      "admin.bootstrap.email=statement-admin@example.com"
    })
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class StatementHttpFlowTest {
  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private CheckoutService checkout;
  @Autowired private RefundService refunds;
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
    var result = stores.ensureDemoStore(seller, "내역시장" + suffix, "내역매장");
    store = result.id();
    market = result.marketId();
    jdbc.update(
        "INSERT INTO pickup_windows(store_id,pickup_date,start_time,end_time,order_deadline) VALUES (?,'2026-10-13','14:00','18:00','13:00')",
        store);
    offer = offer("사과", 1000);
    secondOffer = offer("배", 2000);
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

  @Test
  void buyerSeesOwnConfirmedStatementWithTestNoticeAndSnapshot() throws Exception {
    var order = order();
    long checkoutId = checkoutId(order.id());
    Instant confirmedAt =
        jdbc.queryForObject(
            "SELECT confirmed_at FROM checkouts WHERE id=?", Instant.class, checkoutId);
    try (var customer = session(buyer)) {
      var response = customer.get("/api/buyer/orders/" + checkoutId + "/statement");
      assertThat(response.statusCode()).isEqualTo(200);
      var body = customer.json(response);
      assertThat(body.get("id").asLong()).isEqualTo(checkoutId);
      assertThat(Instant.parse(body.get("confirmedAt").asString())).isEqualTo(confirmedAt);
      assertThat(body.get("totalWon").asString()).isEqualTo("4000");
      assertThat(body.get("storeOrders").size()).isEqualTo(1);
      var items = body.get("storeOrders").get(0).get("items");
      assertThat(items.size()).isEqualTo(2);
      assertThat(items.get(0).get("productName").asString()).isEqualTo("사과");
      assertThat(items.get(0).get("priceWon").asInt()).isEqualTo(1000);
      assertThat(items.get(1).get("productName").asString()).isEqualTo("배");
      assertThat(body.get("testNotice").asString())
          .contains("테스트")
          .contains("공식")
          .contains("제공하지 않습니다");
      assertThat(body.toString())
          .doesNotContain(
              "requestKey", "errorCode", "message", "cardApprovalNumber", "cashReceipt");
    }
  }

  @Test
  void confirmedTimeIsOriginalEvenAfterLaterReadsAndPriceChanges() throws Exception {
    var order = order();
    long checkoutId = checkoutId(order.id());
    Instant confirmedAt =
        jdbc.queryForObject(
            "SELECT confirmed_at FROM checkouts WHERE id=?", Instant.class, checkoutId);
    jdbc.update(
        "UPDATE daily_offers SET price_won=9999,active=false WHERE id IN (?,?)",
        offer,
        secondOffer);
    jdbc.update(
        "UPDATE products SET archived_at=CURRENT_TIMESTAMP, name='바뀐이름' WHERE store_id=?", store);
    clock.set(Instant.parse("2026-10-14T05:00:00Z"));
    try (var customer = session(buyer)) {
      var body = customer.json(customer.get("/api/buyer/orders/" + checkoutId + "/statement"));
      assertThat(Instant.parse(body.get("confirmedAt").asString())).isEqualTo(confirmedAt);
      var items = body.get("storeOrders").get(0).get("items");
      assertThat(items.get(0).get("productName").asString()).isEqualTo("사과");
      assertThat(items.get(1).get("productName").asString()).isEqualTo("배");
      assertThat(items.get(0).get("priceWon").asInt()).isEqualTo(1000);
      assertThat(body.get("totalWon").asString()).isEqualTo("4000");
    }
  }

  @Test
  void missingForeignPendingAndFailedOrdersAreAllNotFound() throws Exception {
    var confirmed = order();
    long confirmedId = checkoutId(confirmed.id());
    String other = "o" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    accounts.ensureDemoAccount(other, "Pass1234!", "다른구매자", other + "@example.com", "BUYER");
    String pendingKey = UUID.randomUUID().toString(), failedKey = UUID.randomUUID().toString();
    // FAILED를 먼저 만들고 PENDING은 시각을 전진시키지 않아 복구 스케줄러의 확정을 배제한다.
    var failedCart = checkout.put(buyer, market, secondOffer, 1);
    checkout.start(buyer, failedKey, failedCart.version(), "FAIL");
    long failedId =
        jdbc.queryForObject("SELECT id FROM checkouts WHERE request_key=?", Long.class, failedKey);
    var cart = checkout.put(buyer, market, offer, 1);
    checkout.start(buyer, pendingKey, cart.version(), "DELAY");
    long pendingId =
        jdbc.queryForObject("SELECT id FROM checkouts WHERE request_key=?", Long.class, pendingKey);
    try (var owner = session(buyer);
        var stranger = session(other);
        var merchant = session(seller);
        var admin = session("statement_admin");
        var anonymous = new HttpSessionClient(port)) {
      assertThat(anonymous.get(path(confirmedId)).statusCode()).isEqualTo(401);
      assertThat(merchant.get(path(confirmedId)).statusCode()).isEqualTo(403);
      assertThat(admin.get(path(confirmedId)).statusCode()).isEqualTo(403);
      assertThat(stranger.get(path(confirmedId)).statusCode()).isEqualTo(404);
      assertThat(owner.get(path(confirmedId + 987654)).statusCode()).isEqualTo(404);
      assertThat(owner.get(path(pendingId)).statusCode()).isEqualTo(404);
      assertThat(owner.get(path(failedId)).statusCode()).isEqualTo(404);
      assertThat(owner.get(path(confirmedId)).statusCode()).isEqualTo(200);
    }
  }

  @Test
  void partialFailureCancellationAndCompletedRefundAreDistinguishedFromOriginalTotal()
      throws Exception {
    var order = order();
    long checkoutId = checkoutId(order.id());
    try (var customer = session(buyer);
        var merchant = session(seller)) {
      assertThat(
              merchant
                  .post(
                      sellerPath(order.id()) + "/failures",
                      json(
                          Map.of(
                              "requestKey",
                              "partial",
                              "itemIds",
                              List.of(order.items().getFirst().id()),
                              "reason",
                              "일부 물량 제공 불가")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      long refund =
          jdbc.queryForObject(
              "SELECT id FROM refunds WHERE store_order_id=?", Long.class, order.id());
      refunds.process(refund);
      clock.set(Instant.parse("2026-10-13T03:00:05Z"));
      var body = customer.json(customer.get(path(checkoutId)));
      var storeOrder = body.get("storeOrders").get(0);
      assertThat(body.get("totalWon").asString()).isEqualTo("4000");
      assertThat(storeOrder.get("cancelledWon").asString()).isEqualTo("2000");
      assertThat(storeOrder.get("refundedWon").asString()).isEqualTo("2000");
      assertThat(storeOrder.get("items").get(0).get("cancelled").asBoolean()).isTrue();
      assertThat(storeOrder.get("items").get(1).get("cancelled").asBoolean()).isFalse();
      assertThat(storeOrder.get("refunds").get(0).get("status").asString()).isEqualTo("COMPLETED");
    }
  }

  @Test
  void failedRefundKeepsCancellationButIsNotCountedAsRefunded() throws Exception {
    var order = order();
    long checkoutId = checkoutId(order.id());
    try (var customer = session(buyer)) {
      assertThat(
              customer
                  .post(
                      buyerPath(order.id()) + "/cancellations",
                      json(Map.of("requestKey", "full-cancel", "kind", "GENERAL")),
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      long refund =
          jdbc.queryForObject(
              "SELECT id FROM refunds WHERE store_order_id=?", Long.class, order.id());
      jdbc.update("UPDATE refunds SET mode='PERMANENT_FAILURE' WHERE id=?", refund);
      refunds.process(refund);
      var body = customer.json(customer.get(path(checkoutId)));
      var storeOrder = body.get("storeOrders").get(0);
      assertThat(body.get("totalWon").asString()).isEqualTo("4000");
      assertThat(storeOrder.get("status").asString()).isEqualTo("CANCELLED");
      assertThat(storeOrder.get("cancelledWon").asString()).isEqualTo("4000");
      assertThat(storeOrder.get("refundedWon").asString()).isEqualTo("0");
      assertThat(storeOrder.get("refunds").get(0).get("status").asString())
          .isEqualTo("NEEDS_ATTENTION");
    }
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

  private long checkoutId(long storeOrderId) {
    return jdbc.queryForObject(
        "SELECT checkout_id FROM store_orders WHERE id=?", Long.class, storeOrderId);
  }

  private static String path(long checkoutId) {
    return "/api/buyer/orders/" + checkoutId + "/statement";
  }

  private static String buyerPath(long id) {
    return "/api/buyer/store-orders/" + id;
  }

  private String sellerPath(long id) {
    return "/api/seller/stores/" + store + "/orders/" + id;
  }

  private static String json(Object value) {
    return new JsonMapper().writeValueAsString(value);
  }

  private HttpSessionClient session(String id) throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(
            client
                .login(id, id.equals("statement_admin") ? "Admin1234!" : "Pass1234!")
                .statusCode())
        .isEqualTo(200);
    client.refreshCsrf();
    return client;
  }
}
