package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.checkout.business.StoreOrderView;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "mirinae.refund.recovery.enabled=false", "admin.bootstrap.enabled=true",
      "admin.bootstrap.login-id=review_admin", "admin.bootstrap.password=Admin1234!",
      "admin.bootstrap.email=review-admin@example.com"
    })
@Import({PostgresTestConfig.class, RedisTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class ReviewHttpFlowTest {
  @Value("${local.server.port}")
  private int port;

  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private CheckoutService checkout;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ProductHttpFlowTest.TestClock clock;
  private String buyer;
  private String seller;
  private String stranger;
  private String otherSeller;
  private long market;
  private long store;
  private long emptyStore;
  private long offer;
  private long secondOffer;

  @BeforeEach
  void fixtures() {
    clock.set(Instant.parse("2026-10-13T03:00:00Z"));
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    buyer = "b" + suffix;
    seller = "s" + suffix;
    stranger = "x" + suffix;
    otherSeller = "y" + suffix;
    for (String id : new String[] {buyer, stranger, seller, otherSeller}) {
      accounts.ensureDemoAccount(
          id,
          "Pass1234!",
          "테스트",
          id + "@example.com",
          id.equals(seller) || id.equals(otherSeller) ? "SELLER" : "BUYER");
    }
    var first = stores.ensureDemoStore(seller, "리뷰시장" + suffix, "리뷰매장");
    store = first.id();
    market = first.marketId();
    emptyStore = stores.ensureDemoStore(otherSeller, "리뷰시장" + suffix, "빈매장").id();
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
        "INSERT INTO daily_offers(store_id,product_id,pickup_date,price_won,online_quantity) VALUES (?,?,'2026-10-13',1000,20) RETURNING id",
        Long.class,
        store,
        product);
  }

  private StoreOrderView order() {
    checkout.put(buyer, market, offer, 1);
    var cart = checkout.put(buyer, market, secondOffer, 1);
    return checkout
        .start(buyer, UUID.randomUUID().toString(), cart.version(), "SUCCESS")
        .checkout()
        .storeOrders()
        .getFirst();
  }

  private void pickup(StoreOrderView order) throws Exception {
    clock.set(Instant.parse("2026-10-13T05:00:00Z"));
    try (var merchant = session(seller)) {
      assertThat(
              merchant
                  .post(
                      "/api/seller/stores/" + store + "/orders/" + order.id() + "/pickup",
                      "{\"code\":\"" + order.pickupCode() + "\"}",
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
    }
  }

  private HttpSessionClient session(String id) throws Exception {
    var session = new HttpSessionClient(port);
    session.refreshCsrf();
    assertThat(
            session.login(id, id.equals("review_admin") ? "Admin1234!" : "Pass1234!").statusCode())
        .isEqualTo(200);
    session.refreshCsrf();
    return session;
  }

  /** 고정 Clock 이동으로 기존 access·유휴 기한이 지난 뒤 같은 사용자로 세션을 다시 만든다. */
  private void loginAgain(HttpSessionClient session, String id) throws Exception {
    session.clearAccessToken();
    session.refreshCsrf();
    assertThat(
            session.login(id, id.equals("review_admin") ? "Admin1234!" : "Pass1234!").statusCode())
        .isEqualTo(200);
    session.refreshCsrf();
  }

  private static String own(long order) {
    return "/api/buyer/store-orders/" + order + "/review";
  }

  private String publicPath() {
    return "/api/markets/" + market + "/stores/" + store + "/reviews";
  }

  private String sellerPath(long review) {
    return "/api/seller/stores/" + store + "/reviews/" + review;
  }

  private static String content(int rating) {
    return "{\"rating\":" + rating + ",\"content\":\"구매 후기\"}";
  }

  private static long reviewId(HttpSessionClient session, long order) throws Exception {
    return session.json(session.get(own(order))).get("review").get("review").get("id").asLong();
  }

  @Test
  void verifiedPickupReviewEditReplyDeleteAndRestoreKeepOneIdentity() throws Exception {
    var order = order();
    pickup(order);
    try (var customer = session(buyer);
        var merchant = session(seller)) {
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(200);
      long id = reviewId(customer, order.id());
      assertThat(
              merchant.put(sellerPath(id) + "/reply", "{\"content\":\"감사합니다\"}", true).statusCode())
          .isEqualTo(200);
      assertThat(
              merchant
                  .put(sellerPath(id) + "/reply", "{\"content\":\"다시 찾아주세요\"}", true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(customer.put(own(order.id()), content(4), true).statusCode()).isEqualTo(200);
      var publicBody = customer.json(customer.get(publicPath()));
      assertThat(publicBody.get("summary").get("averageRating").asDouble()).isEqualTo(4.0);
      assertThat(publicBody.get("totalItems").asInt()).isEqualTo(1);
      assertThat(publicBody.get("items").get(0).get("reply").get("content").asString())
          .isEqualTo("다시 찾아주세요");
      assertThat(publicBody.toString())
          .doesNotContain("storeOrderId", "pickupCode", "buyerId", "loginId", "email", "phone");
      assertThat(customer.delete(own(order.id()), true).statusCode()).isEqualTo(204);
      assertThat(
              customer
                  .json(customer.get(publicPath()))
                  .get("summary")
                  .get("averageRating")
                  .isNull())
          .isTrue();
      assertThat(customer.put(own(order.id()), content(3), true).statusCode()).isEqualTo(409);
      clock.set(Instant.parse("2026-11-14T05:00:00Z"));
      // 날짜를 크게 넘겨 access·유휴 수명이 지나므로 리뷰 업무 규칙 검증 전에 새 로그인을 준비한다.
      loginAgain(customer, buyer);
      assertThat(
              customer
                  .post(own(order.id()) + "/restore", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(customer.put(own(order.id()), content(3), true).statusCode()).isEqualTo(200);
      assertThat(reviewId(customer, order.id())).isEqualTo(id);
      assertThat(
              customer.json(customer.get(publicPath())).get("summary").get("reviewCount").asInt())
          .isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM store_reviews WHERE store_order_id=?",
                  Long.class,
                  order.id()))
          .isEqualTo(1);
    }
  }

  @Test
  void newReviewDeadlineAndInputBoundariesAreEnforced() throws Exception {
    var order = order();
    pickup(order);
    Instant deadline = clock.instant().plus(Duration.ofDays(30));
    try (var customer = session(buyer)) {
      for (String input :
          new String[] {
            content(0),
            content(6),
            "{\"rating\":4.5,\"content\":\"후기\"}",
            "{\"rating\":5,\"content\":\" \"}",
            "{\"rating\":null,\"content\":\"후기\"}",
            "{\"rating\":5,\"content\":\"" + "가".repeat(1001) + "\"}"
          }) {
        assertThat(customer.put(own(order.id()), input, true).statusCode()).isEqualTo(400);
      }
      clock.set(deadline);
      // 30일 뒤라 기존 access·유휴 수명이 지났다. 리뷰 마감 경계 검증을 위해 세션을 다시 만든다.
      loginAgain(customer, buyer);
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(409);
      assertThat(customer.json(customer.get(own(order.id()))).get("canCreate").asBoolean())
          .isFalse();
      clock.set(deadline.minusSeconds(1));
      loginAgain(customer, buyer);
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(200);
    }
  }

  @Test
  void purchaseStateOwnershipRoleAndCsrfAreChecked() throws Exception {
    var order = order();
    try (var customer = session(buyer);
        var foreign = session(stranger);
        var merchant = session(seller);
        var anonymous = new HttpSessionClient(port)) {
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(409);
      assertThat(customer.put(own(order.id()), content(5), false).statusCode()).isEqualTo(403);
      assertThat(foreign.get(own(order.id())).statusCode()).isEqualTo(404);
      assertThat(anonymous.get(publicPath()).statusCode()).isEqualTo(401);
      assertThat(merchant.put(own(order.id()), content(5), true).statusCode()).isEqualTo(403);
      assertThat(customer.get("/api/admin/reviews").statusCode()).isEqualTo(403);
      assertThat(
              customer
                  .post(
                      "/api/buyer/store-orders/" + order.id() + "/cancellations",
                      "{\"requestKey\":\"cancel-review\",\"kind\":\"GENERAL\"}",
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(409);
    }
  }

  @Test
  void partiallyCancelledPickupCanBeReviewedAndOtherStoresCannotReply() throws Exception {
    var order = order();
    try (var merchant = session(seller);
        var foreign = session(otherSeller);
        var customer = session(buyer)) {
      assertThat(
              merchant
                  .post(
                      "/api/seller/stores/" + store + "/orders/" + order.id() + "/failures",
                      "{\"requestKey\":\"partial\",\"itemIds\":["
                          + order.items().getFirst().id()
                          + "],\"reason\":\"제공 불가\"}",
                      "application/json",
                      true)
                  .statusCode())
          .isEqualTo(200);
      pickup(order);
      loginAgain(customer, buyer);
      // foreign 세션도 Clock 이동 전에 만들어졌으므로 다시 인증한다.
      loginAgain(foreign, otherSeller);
      assertThat(customer.put(own(order.id()), content(5), true).statusCode()).isEqualTo(200);
      long id = reviewId(customer, order.id());
      assertThat(foreign.put(sellerPath(id) + "/reply", "{\"content\":\"답글\"}", true).statusCode())
          .isEqualTo(403);
      assertThat(
              foreign
                  .put(
                      "/api/seller/stores/" + emptyStore + "/reviews/" + id + "/reply",
                      "{\"content\":\"답글\"}",
                      true)
                  .statusCode())
          .isEqualTo(404);
    }
  }

  @Test
  void deletionRequestDoesNotHideReviewAndAdminCannotUndoAuthorsDeletion() throws Exception {
    var order = order();
    pickup(order);
    try (var customer = session(buyer);
        var merchant = session(seller);
        var admin = session("review_admin")) {
      customer.put(own(order.id()), content(2), true);
      long id = reviewId(customer, order.id());
      String requestPath = sellerPath(id) + "/deletion-requests";
      var requestResponse =
          merchant.post(requestPath, "{\"reason\":\"확인 요청\"}", "application/json", true);
      assertThat(requestResponse.statusCode()).isEqualTo(200);
      long request = merchant.json(requestResponse).get("id").asLong();
      assertThat(
              merchant
                  .json(
                      merchant.post(
                          requestPath, "{\"reason\":\"확인 요청\"}", "application/json", true))
                  .get("id")
                  .asLong())
          .isEqualTo(request);
      assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt()).isEqualTo(1);
      String decision = "/api/admin/review-deletion-requests/" + request + "/decision";
      String body = "{\"approved\":true,\"reason\":\"운영 확인\"}";
      assertThat(admin.post(decision, body, "application/json", true).statusCode()).isEqualTo(200);
      assertThat(admin.post(decision, body, "application/json", true).statusCode()).isEqualTo(200);
      assertThat(
              admin
                  .post(
                      decision, "{\"approved\":false,\"reason\":\"번복\"}", "application/json", true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='REVIEW_REQUEST' AND target_id=?",
                  Long.class,
                  request))
          .isEqualTo(1);
      assertThat(
              customer
                  .post(own(order.id()) + "/restore", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(409);
      customer.delete(own(order.id()), true);
      assertThat(
              admin
                  .post("/api/admin/reviews/" + id + "/restore", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(204);
      assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt()).isZero();
      assertThat(
              customer
                  .post(own(order.id()) + "/restore", "{}", "application/json", true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt()).isEqualTo(1);
    }
  }

  @Test
  void concurrentWritesAndBatchSummariesCountOrdersOnlyOnce() throws Exception {
    var first = order();
    var second = order();
    pickup(first);
    pickup(second);
    try (var one = session(buyer);
        var two = session(buyer)) {
      var a = one.putAsync(own(first.id()), content(4));
      var b = two.putAsync(own(first.id()), content(4));
      assertThat(a.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
      assertThat(b.get(30, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
      assertThat(one.put(own(second.id()), content(5), true).statusCode()).isEqualTo(200);
      var summaryResponse =
          one.get(
              "/api/markets/"
                  + market
                  + "/review-summaries?storeIds="
                  + store
                  + ","
                  + emptyStore
                  + ","
                  + store);
      assertThat(summaryResponse.statusCode()).isEqualTo(200);
      JsonNode summaries = one.json(summaryResponse);
      assertThat(summaries.size()).isEqualTo(2);
      assertThat(summaries.get(0).get("averageRating").asDouble()).isEqualTo(4.5);
      assertThat(summaries.get(0).get("reviewCount").asInt()).isEqualTo(2);
      assertThat(summaries.get(1).get("averageRating").isNull()).isTrue();
      assertThat(
              one.get("/api/markets/" + market + "/review-summaries?storeIds=" + Long.MAX_VALUE)
                  .statusCode())
          .isEqualTo(404);
      assertThat(one.get("/api/markets/" + market + "/review-summaries?storeIds=0").statusCode())
          .isEqualTo(400);
    }
  }

  @Test
  void databaseRequiresReasonsForAdministratorDeletionAndDecision() throws Exception {
    var order = order();
    pickup(order);
    try (var customer = session(buyer);
        var merchant = session(seller)) {
      customer.put(own(order.id()), content(5), true);
      long id = reviewId(customer, order.id());
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE store_reviews SET admin_deleted_at=now(),admin_deleted_by=(SELECT id FROM accounts WHERE login_id='review_admin') WHERE id=?",
                      id))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      var response =
          merchant.post(
              sellerPath(id) + "/deletion-requests",
              "{\"reason\":\"확인 요청\"}",
              "application/json",
              true);
      long request = merchant.json(response).get("id").asLong();
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE review_deletion_requests SET status='APPROVED',decided_at=now(),decided_by=(SELECT id FROM accounts WHERE login_id='review_admin') WHERE id=?",
                      request))
          .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
      assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt()).isEqualTo(1);
    }
  }

  @Test
  void rejectionKeepsReviewPublicAndAllowsANewDeletionRequest() throws Exception {
    var order = order();
    pickup(order);
    try (var customer = session(buyer);
        var merchant = session(seller);
        var admin = session("review_admin")) {
      customer.put(own(order.id()), content(4), true);
      long id = reviewId(customer, order.id());
      String path = sellerPath(id) + "/deletion-requests";
      var initial = merchant.post(path, "{\"reason\":\"첫 요청\"}", "application/json", true);
      assertThat(initial.statusCode()).isEqualTo(200);
      long request = merchant.json(initial).get("id").asLong();
      String decision = "/api/admin/review-deletion-requests/" + request + "/decision";
      String body = "{\"approved\":false,\"reason\":\"검토 후 유지\"}";
      var rejected = admin.post(decision, body, "application/json", true);
      assertThat(rejected.statusCode()).isEqualTo(200);
      assertThat(admin.json(rejected).get("status").asString()).isEqualTo("REJECTED");
      assertThat(admin.post(decision, body, "application/json", true).statusCode()).isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='REVIEW_REQUEST' AND target_id=?",
                  Long.class,
                  request))
          .isEqualTo(1);
      var visible = customer.json(customer.get(publicPath()));
      assertThat(visible.get("totalItems").asInt()).isEqualTo(1);
      assertThat(visible.get("summary").get("averageRating").asDouble()).isEqualTo(4.0);
      var fresh = merchant.post(path, "{\"reason\":\"새 사유 확인 요청\"}", "application/json", true);
      assertThat(fresh.statusCode()).isEqualTo(200);
      assertThat(merchant.json(fresh).get("id").asLong()).isNotEqualTo(request);
      assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt()).isEqualTo(1);
    }
  }

  @Test
  void administratorAuditFailureRollsBackModeration() throws Exception {
    var order = order();
    pickup(order);
    try (var customer = session(buyer);
        var admin = session("review_admin")) {
      customer.put(own(order.id()), content(5), true);
      long id = reviewId(customer, order.id());
      String trigger = "review_audit_fail_" + id;
      jdbc.execute(
          "CREATE FUNCTION "
              + trigger
              + "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$");
      jdbc.execute(
          "CREATE TRIGGER "
              + trigger
              + " BEFORE INSERT ON administrator_changes FOR EACH ROW WHEN (NEW.target_type='REVIEW' AND NEW.target_id="
              + id
              + ") EXECUTE FUNCTION "
              + trigger
              + "()");
      try {
        assertThat(
                admin
                    .post(
                        "/api/admin/reviews/" + id + "/delete",
                        "{\"reason\":\"운영 확인\"}",
                        "application/json",
                        true)
                    .statusCode())
            .isEqualTo(500);
        assertThat(customer.json(customer.get(publicPath())).get("totalItems").asInt())
            .isEqualTo(1);
      } finally {
        jdbc.execute("DROP TRIGGER " + trigger + " ON administrator_changes");
        jdbc.execute("DROP FUNCTION " + trigger + "()");
      }
    }
  }
}
