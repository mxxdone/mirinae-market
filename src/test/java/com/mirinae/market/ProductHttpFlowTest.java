package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.modules.store.business.StoreView;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import java.net.URLEncoder;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({PostgresTestConfig.class, ProductHttpFlowTest.TimeConfig.class})
class ProductHttpFlowTest {
  private static final String PASSWORD = "Pass1234!";
  private static final LocalDate DATE = LocalDate.parse("2026-10-13");
  private final JsonMapper mapper = JsonMapper.builder().build();

  @Value("${local.server.port}")
  private int port;

  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestClock clock;
  private Seller first;
  private Seller sameMarket;
  private Seller otherMarket;
  private String buyerId;

  @BeforeEach
  void fixtures() {
    clock.set(Instant.parse("2026-10-13T03:00:00Z"));
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    first = seller("a" + suffix, "시장" + suffix);
    sameMarket = seller("b" + suffix, "시장" + suffix);
    otherMarket = seller("c" + suffix, "다른시장" + suffix);
    buyerId = "u" + suffix;
    accounts.ensureDemoAccount(buyerId, PASSWORD, "구매자", buyerId + "@example.com", "BUYER");
  }

  private Seller seller(String loginId, String market) {
    accounts.ensureDemoAccount(loginId, PASSWORD, "판매자", loginId + "@example.com", "SELLER");
    StoreView store = stores.ensureDemoStore(loginId, market, "매장" + loginId);
    return new Seller(loginId, store.id(), store.marketId());
  }

  private static void login(HttpSessionClient session, String loginId) throws Exception {
    session.refreshCsrf();
    assertThat(session.login(loginId, PASSWORD).statusCode()).isEqualTo(200);
    session.refreshCsrf();
  }

  private static String productPath(Seller seller) {
    return "/api/seller/stores/" + seller.storeId() + "/products";
  }

  private static String windowPath(Seller seller, LocalDate date) {
    return "/api/seller/stores/" + seller.storeId() + "/pickup-windows/" + date;
  }

  private static String offerPath(Seller seller, long productId, LocalDate date) {
    return productPath(seller) + "/" + productId + "/offers/" + date;
  }

  private static String searchPath(Seller seller) {
    return "/api/markets/" + seller.marketId() + "/offers";
  }

  private String productJson(String name, String type, int amount, String description) {
    return mapper.writeValueAsString(
        java.util.Map.of(
            "name", name, "unitType", type, "unitAmount", amount, "description", description));
  }

  private long create(
      HttpSessionClient session, Seller seller, String name, String type, int amount)
      throws Exception {
    HttpResponse<String> response =
        session.post(
            productPath(seller), productJson(name, type, amount, "설명"), "application/json", true);
    assertThat(response.statusCode()).isEqualTo(201);
    return session.json(response).get("id").asLong();
  }

  private JsonNode publish(
      HttpSessionClient session, Seller seller, long productId, int price, int quantity)
      throws Exception {
    assertThat(
            session
                .put(
                    windowPath(seller, DATE),
                    "{\"startTime\":\"14:00\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}",
                    true)
                .statusCode())
        .isEqualTo(200);
    HttpResponse<String> response =
        session.put(
            offerPath(seller, productId, DATE),
            "{\"priceWon\":" + price + ",\"onlineQuantity\":" + quantity + "}",
            true);
    assertThat(response.statusCode()).isEqualTo(200);
    return session.json(response);
  }

  @Test
  void archiveRemovesPublicAndSellerListingsWhilePreservingHistoryAndOwnership() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port);
        HttpSessionClient buyer = new HttpSessionClient(port);
        HttpSessionClient anonymous = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      login(buyer, buyerId);
      anonymous.refreshCsrf();
      long id = create(seller, first, "삭제 상품", "WEIGHT", 1000);
      long offerId = publish(seller, first, id, 9000, 10).get("id").asLong();
      String path = productPath(first) + "/" + id;
      assertThat(anonymous.delete(path, true).statusCode()).isEqualTo(401);
      assertThat(buyer.delete(path, true).statusCode()).isEqualTo(403);
      assertThat(seller.delete(productPath(otherMarket) + "/" + id, true).statusCode())
          .isEqualTo(403);
      assertThat(seller.delete(path, false).statusCode()).isEqualTo(403);
      assertThat(seller.delete(path, true).statusCode()).isEqualTo(204);
      assertThat(seller.delete(path, true).statusCode()).isEqualTo(204);
      assertThat(seller.json(seller.get(productPath(first))).get("items").size()).isZero();
      assertThat(seller.json(seller.get(productPath(first))).get("totalItems").asLong()).isZero();
      assertThat(buyer.json(buyer.get(searchPath(first))).get("items").size()).isZero();
      assertThat(buyer.json(buyer.get(searchPath(first))).get("totalItems").asLong()).isZero();
      assertThat(buyer.get(searchPath(first) + "/" + offerId).statusCode()).isEqualTo(404);
      assertThat(
              seller
                  .put(offerPath(first, id, DATE), "{\"priceWon\":1,\"onlineQuantity\":1}", true)
                  .statusCode())
          .isEqualTo(404);
      assertThat(seller.put(path, productJson("삭제 상품", "WEIGHT", 1000, "설명"), true).statusCode())
          .isEqualTo(404);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM products WHERE id = ? AND archived_at IS NOT NULL",
                  Long.class,
                  id))
          .isEqualTo(1);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM daily_offers WHERE id = ?", Long.class, offerId))
          .isEqualTo(1);
    }
  }

  @Test
  void sellerDraftPublishAndBuyerSearchCompareUseRealHttpAndPostgres() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port);
        HttpSessionClient buyer = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      login(buyer, buyerId);
      long productId = create(seller, first, " 국내산 양파 3kg ", "WEIGHT", 3000);
      assertThat(buyer.json(buyer.get(searchPath(first))).get("items").size()).isZero();
      HttpResponse<String> missingWindow =
          seller.put(
              offerPath(first, productId, DATE), "{\"priceWon\":9000,\"onlineQuantity\":20}", true);
      assertThat(missingWindow.statusCode()).isEqualTo(409);
      assertThat(missingWindow.body()).contains("PICKUP_WINDOW_REQUIRED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM daily_offers WHERE product_id = ?", Long.class, productId))
          .isZero();
      JsonNode offer = publish(seller, first, productId, 9000, 20);
      HttpResponse<String> restoredWindow = seller.get(windowPath(first, DATE));
      assertThat(restoredWindow.statusCode()).isEqualTo(200);
      assertThat(seller.json(restoredWindow).get("startTime").asString()).startsWith("14:00");
      assertThat(offer.get("productName").asString()).isEqualTo("국내산 양파 3kg");
      assertThat(offer.get("unitAmount").asInt()).isEqualTo(3000);
      assertThat(offer.get("priceWon").asInt()).isEqualTo(9000);
      assertThat(offer.get("comparisonPriceWon").asDouble()).isEqualTo(300.0);
      assertThat(offer.get("comparisonUnit").asString()).isEqualTo("100g");
      assertThat(
              jdbc.queryForObject(
                  "SELECT unit_amount FROM products WHERE id = ?", Integer.class, productId))
          .isEqualTo(3000);
      assertThat(buyer.get("/api/markets").body()).contains("시장");
      HttpResponse<String> search =
          buyer.get(
              searchPath(first) + "?query=" + URLEncoder.encode("양파", StandardCharsets.UTF_8));
      assertThat(buyer.json(search).get("items").size()).isEqualTo(1);
      assertThat(buyer.json(search).get("totalItems").asLong()).isEqualTo(1);
      assertThat(buyer.get(searchPath(first) + "/" + offer.get("id").asLong()).statusCode())
          .isEqualTo(200);
      JsonNode large =
          publish(seller, first, create(seller, first, "양파 1kg", "WEIGHT", 1000), 10000, 1);
      JsonNode small =
          publish(seller, first, create(seller, first, "양파 100g", "WEIGHT", 100), 1500, 1);
      JsonNode count =
          publish(seller, first, create(seller, first, "사과 12개", "COUNT", 12), 1000, 1);
      assertThat(large.get("comparisonPriceWon").asDouble()).isEqualTo(1000.0);
      assertThat(small.get("comparisonPriceWon").asDouble()).isEqualTo(1500.0);
      assertThat(count.get("comparisonPriceWon").asDouble()).isEqualTo(83.33);
      assertThat(count.get("comparisonUnit").asString()).isEqualTo("1개");
      assertThat(buyer.json(buyer.get(searchPath(first))).get("items").size()).isEqualTo(4);
    }
  }

  @Test
  void updatesKeepOfferIdentityAndSharedWindowWhileFreezingPublishedComposition() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      long id = create(seller, first, "상품", "COUNT", 1);
      assertThat(
              seller
                  .put(
                      productPath(first) + "/" + id,
                      productJson("양파 1kg", "WEIGHT", 1000, "수정"),
                      true)
                  .statusCode())
          .isEqualTo(200);
      long offerId = publish(seller, first, id, 10000, 10).get("id").asLong();
      long secondId = create(seller, first, "양파 100g", "WEIGHT", 100);
      long secondOffer = publish(seller, first, secondId, 1500, 5).get("id").asLong();
      HttpResponse<String> changed =
          seller.put(offerPath(first, id, DATE), "{\"priceWon\":8000,\"onlineQuantity\":0}", true);
      assertThat(changed.statusCode()).isEqualTo(200);
      assertThat(seller.json(changed).get("id").asLong()).isEqualTo(offerId);
      assertThat(seller.json(changed).get("onlineQuantity").asInt()).isZero();
      HttpResponse<String> locked =
          seller.put(productPath(first) + "/" + id, productJson("다른 상품", "COUNT", 12, "변경"), true);
      assertThat(locked.statusCode()).isEqualTo(409);
      assertThat(locked.body()).contains("PRODUCT_LOCKED");
      assertThat(
              seller
                  .put(
                      productPath(first) + "/" + id,
                      productJson("양파 1kg", "WEIGHT", 1000, "새 설명"),
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              seller
                  .put(
                      windowPath(first, DATE),
                      "{\"startTime\":\"15:00\",\"endTime\":\"19:00\",\"orderDeadline\":\"14:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      for (long current : List.of(offerId, secondOffer)) {
        JsonNode detail = seller.json(seller.get(searchPath(first) + "/" + current));
        assertThat(detail.get("startTime").asString()).startsWith("15:00");
        assertThat(detail.get("endTime").asString()).startsWith("19:00");
      }
      JsonNode detail = seller.json(seller.get(searchPath(first) + "/" + offerId));
      assertThat(detail.get("priceWon").asInt()).isEqualTo(8000);
      assertThat(detail.get("description").asString()).isEqualTo("새 설명");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM daily_offers WHERE product_id = ?", Long.class, id))
          .isEqualTo(1L);
      assertThat(
              seller
                  .put(productPath(first) + "/999999999", productJson("상품", "COUNT", 1, ""), true)
                  .statusCode())
          .isEqualTo(404);
      assertThat(
              seller
                  .put(
                      offerPath(first, 999999999, DATE),
                      "{\"priceWon\":1,\"onlineQuantity\":1}",
                      true)
                  .statusCode())
          .isEqualTo(404);
    }
  }

  @Test
  void marketIsolationLiteralSearchAndStablePaginationDoNotGroupOrPriceSort() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port);
        HttpSessionClient same = new HttpSessionClient(port);
        HttpSessionClient other = new HttpSessionClient(port);
        HttpSessionClient buyer = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      login(same, sameMarket.loginId());
      login(other, otherMarket.loginId());
      login(buyer, buyerId);
      long firstOffer =
          publish(seller, first, create(seller, first, "Tomato 양파%_", "WEIGHT", 1000), 10000, 2)
              .get("id")
              .asLong();
      long secondOffer =
          publish(same, sameMarket, create(same, sameMarket, "Tomato 양파", "WEIGHT", 100), 100, 2)
              .get("id")
              .asLong();
      long foreignOffer =
          publish(other, otherMarket, create(other, otherMarket, "Tomato 양파", "WEIGHT", 100), 1, 2)
              .get("id")
              .asLong();
      JsonNode page = buyer.json(buyer.get(searchPath(first) + "?query=tomato&size=1"));
      assertThat(page.get("items").size()).isEqualTo(1);
      assertThat(page.get("items").get(0).get("id").asLong()).isEqualTo(firstOffer);
      assertThat(page.get("hasNext").asBoolean()).isTrue();
      JsonNode next = buyer.json(buyer.get(searchPath(first) + "?query=tomato&size=1&page=1"));
      assertThat(next.get("items").get(0).get("id").asLong()).isEqualTo(secondOffer);
      assertThat(next.get("hasNext").asBoolean()).isFalse();
      assertThat(buyer.json(buyer.get(searchPath(first) + "?query=%25_")).get("items").size())
          .isEqualTo(1);
      assertThat(
              buyer
                  .json(buyer.get(searchPath(first) + "?query=%27%20OR%201%3D1"))
                  .get("items")
                  .size())
          .isZero();
      assertThat(buyer.get(searchPath(first) + "/" + foreignOffer).statusCode()).isEqualTo(404);
      assertThat(buyer.get(searchPath(otherMarket) + "/" + firstOffer).statusCode()).isEqualTo(404);
      assertThat(buyer.json(buyer.get(searchPath(first) + "?page=99")).get("items").size())
          .isZero();
      assertThat(seller.json(seller.get(productPath(first) + "?size=1")).get("items").size())
          .isEqualTo(1);
    }
  }

  @Test
  void unauthenticatedBuyerForeignStoreAndMissingCsrfCannotWrite() throws Exception {
    try (HttpSessionClient anonymous = new HttpSessionClient(port);
        HttpSessionClient buyer = new HttpSessionClient(port);
        HttpSessionClient seller = new HttpSessionClient(port)) {
      anonymous.refreshCsrf();
      login(buyer, buyerId);
      login(seller, first.loginId());
      String body = productJson("상품", "COUNT", 1, "");
      assertThat(anonymous.get("/api/markets").statusCode()).isEqualTo(401);
      assertThat(anonymous.get(searchPath(first)).statusCode()).isEqualTo(401);
      assertThat(anonymous.post(productPath(first), body, "application/json", true).statusCode())
          .isEqualTo(401);
      assertThat(buyer.post(productPath(first), body, "application/json", true).statusCode())
          .isEqualTo(403);
      assertThat(seller.post(productPath(sameMarket), body, "application/json", true).statusCode())
          .isEqualTo(403);
      assertThat(seller.post(productPath(first), body, "application/json", false).statusCode())
          .isEqualTo(403);
      assertThat(seller.get(productPath(otherMarket)).statusCode()).isEqualTo(403);
      assertThat(seller.get(windowPath(otherMarket, DATE)).statusCode()).isEqualTo(403);
      assertThat(buyer.get(windowPath(first, DATE)).statusCode()).isEqualTo(403);
      assertThat(anonymous.get(windowPath(first, DATE)).statusCode()).isEqualTo(401);
      assertThat(
              seller
                  .put(
                      windowPath(otherMarket, DATE),
                      "{\"startTime\":\"14:00\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(403);
      assertThat(
              seller
                  .put(
                      offerPath(otherMarket, 1, DATE),
                      "{\"priceWon\":1,\"onlineQuantity\":1}",
                      true)
                  .statusCode())
          .isEqualTo(403);
      assertThat(seller.put(productPath(otherMarket) + "/1", body, true).statusCode())
          .isEqualTo(403);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM products WHERE store_id IN (?, ?, ?)",
                  Long.class,
                  first.storeId(),
                  sameMarket.storeId(),
                  otherMarket.storeId()))
          .isZero();
      long id = create(seller, first, "상품", "COUNT", 1);
      publish(seller, first, id, 1000, 10);
      assertThat(
              seller
                  .put(offerPath(first, id, DATE), "{\"priceWon\":1,\"onlineQuantity\":0}", false)
                  .statusCode())
          .isEqualTo(403);
      assertThat(
              seller
                  .put(
                      windowPath(first, DATE),
                      "{\"startTime\":\"15:00\",\"endTime\":\"19:00\",\"orderDeadline\":\"14:00\"}",
                      false)
                  .statusCode())
          .isEqualTo(403);
      assertThat(seller.put(productPath(first) + "/" + id, body, false).statusCode())
          .isEqualTo(403);
      assertThat(
              jdbc.queryForObject(
                  "SELECT price_won FROM daily_offers WHERE product_id = ?", Integer.class, id))
          .isEqualTo(1000);
    }
  }

  @Test
  void invalidNumbersDatesAndWindowsAreRejectedWithoutChangingSavedData() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      for (String body :
          List.of(
              "{}",
              "null",
              "{",
              "{\"name\":\"상품\",\"unitType\":\"WEIGHT\",\"unitAmount\":550}",
              "{\"name\":\"상품\",\"unitType\":\"COUNT\",\"unitAmount\":1.5}",
              "{\"name\":\"상품\",\"unitType\":\"COUNT\",\"unitAmount\":2147483648}")) {
        HttpResponse<String> response =
            seller.post(productPath(first), body, "application/json", true);
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_INPUT");
      }
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM products WHERE store_id = ?", Long.class, first.storeId()))
          .isZero();
      long id = create(seller, first, "상품", "COUNT", 12);
      long offerId = publish(seller, first, id, 1000, 10).get("id").asLong();
      for (String body :
          List.of(
              "{}",
              "{\"priceWon\":0,\"onlineQuantity\":1}",
              "{\"priceWon\":1,\"onlineQuantity\":-1}",
              "{\"priceWon\":1.5,\"onlineQuantity\":1}",
              "{\"priceWon\":1,\"onlineQuantity\":1.5}")) {
        assertThat(seller.put(offerPath(first, id, DATE), body, true).statusCode()).isEqualTo(400);
      }
      for (String body :
          List.of(
              "{}",
              "{\"startTime\":\"18:00\",\"endTime\":\"14:00\"}",
              "{\"startTime\":\"14:00\",\"endTime\":\"14:00\"}",
              "{\"startTime\":\"14:00:01\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}")) {
        assertThat(seller.put(windowPath(first, DATE), body, true).statusCode()).isEqualTo(400);
      }
      for (String path :
          List.of(
              offerPath(first, id, DATE.minusDays(1)),
              offerPath(first, id, DATE.plusDays(1)),
              productPath(first) + "/" + id + "/offers/not-a-date")) {
        assertThat(seller.put(path, "{\"priceWon\":1,\"onlineQuantity\":1}", true).statusCode())
            .isEqualTo(400);
      }
      for (String parameters :
          List.of(
              "?page=-1",
              "?size=0",
              "?size=101",
              "?page=2147483647&size=100",
              "?page=1.5",
              "?query=" + "x".repeat(101))) {
        HttpResponse<String> response = seller.get(searchPath(first) + parameters);
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_INPUT");
      }
      JsonNode saved = seller.json(seller.get(searchPath(first) + "/" + offerId));
      assertThat(saved.get("priceWon").asInt()).isEqualTo(1000);
      assertThat(saved.get("onlineQuantity").asInt()).isEqualTo(10);
      assertThat(saved.get("startTime").asString()).startsWith("14:00");
    }
  }

  @Test
  void midnightClosesOldDateAndPublishesOnlyTheNewTomorrow() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      long productId = create(seller, first, "양파 3kg", "WEIGHT", 3000);
      clock.set(Instant.parse("2026-10-13T03:59:59Z"));
      long oldOffer = publish(seller, first, productId, 9000, 20).get("id").asLong();
      assertThat(
              seller
                  .json(seller.get(productPath(first)))
                  .get("items")
                  .get(0)
                  .get("hasSales")
                  .asBoolean())
          .isTrue();
      clock.set(Instant.parse("2026-10-13T04:00:00Z"));
      assertThat(
              seller
                  .put(
                      offerPath(first, productId, DATE),
                      "{\"priceWon\":1,\"onlineQuantity\":0}",
                      true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(
              seller
                  .put(
                      windowPath(first, DATE),
                      "{\"startTime\":\"15:00\",\"endTime\":\"19:00\",\"orderDeadline\":\"14:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(seller.get(searchPath(first) + "/" + oldOffer).statusCode()).isEqualTo(404);
      assertThat(seller.json(seller.get(searchPath(first))).get("items").size()).isZero();
      assertThat(
              seller
                  .json(seller.get(productPath(first)))
                  .get("items")
                  .get(0)
                  .get("hasSales")
                  .asBoolean())
          .isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT price_won FROM daily_offers WHERE id = ?", Integer.class, oldOffer))
          .isEqualTo(9000);
      assertThat(seller.get(windowPath(first, DATE)).statusCode()).isEqualTo(200);
      clock.set(Instant.parse("2026-10-13T15:00:00Z"));
      assertThat(seller.json(seller.get(searchPath(first))).get("items").size()).isZero();
      LocalDate next = DATE.plusDays(1);
      assertThat(
              seller
                  .put(
                      windowPath(first, next),
                      "{\"startTime\":\"14:00\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(
              seller
                  .put(
                      offerPath(first, productId, next),
                      "{\"priceWon\":9500,\"onlineQuantity\":15}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThat(seller.json(seller.get(searchPath(first))).get("items").size()).isEqualTo(1);
    }
  }

  @Test
  void databaseConstraintsPreventInvalidCompositionAndCrossStoreOffers() throws Exception {
    try (HttpSessionClient seller = new HttpSessionClient(port);
        HttpSessionClient other = new HttpSessionClient(port)) {
      login(seller, first.loginId());
      login(other, otherMarket.loginId());
      long id = create(seller, first, "상품", "WEIGHT", 100);
      publish(seller, first, id, 1000, 10);
      long unpublished = create(seller, first, "미공개", "COUNT", 1);
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE pickup_windows SET start_time = '14:00:00.4' WHERE store_id = ? AND pickup_date = ?",
                      first.storeId(),
                      DATE))
          .isInstanceOf(DataIntegrityViolationException.class);
      assertThatThrownBy(
              () -> jdbc.update("UPDATE products SET unit_amount = 550 WHERE id = ?", id))
          .isInstanceOf(DataIntegrityViolationException.class);
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE daily_offers SET online_quantity = -1 WHERE product_id = ?", id))
          .isInstanceOf(DataIntegrityViolationException.class);
      assertThat(
              other
                  .put(
                      windowPath(otherMarket, DATE),
                      "{\"startTime\":\"14:00\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "INSERT INTO daily_offers (store_id, product_id, pickup_date, price_won, online_quantity) VALUES (?, ?, ?, 1000, 1)",
                      otherMarket.storeId(),
                      unpublished,
                      DATE))
          .isInstanceOf(DataIntegrityViolationException.class);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM flyway_schema_history WHERE success AND version IN ('1','2')",
                  Long.class))
          .isEqualTo(2L);
      HttpResponse<String> docs = seller.get("/v3/api-docs");
      assertThat(docs.statusCode()).isEqualTo(200);
      JsonNode security =
          seller
              .json(docs)
              .get("paths")
              .get("/api/seller/stores/{storeId}/products")
              .get("post")
              .get("security");
      assertThat(security.size()).isEqualTo(1);
      assertThat(security.get(0).get("sessionCookie")).isNotNull();
      assertThat(security.get(0).get("csrfToken")).isNotNull();
      assertThat(docs.body())
          .contains(
              "/api/markets/{marketId}/offers",
              "PICKUP_WINDOW_REQUIRED",
              "PRODUCT_LOCKED",
              "csrfToken",
              "unitAmount");
    }
  }

  @Test
  void concurrentOfferUpsertsAndCompositionChangesStayConsistent() throws Exception {
    try (HttpSessionClient firstSession = new HttpSessionClient(port);
        HttpSessionClient secondSession = new HttpSessionClient(port)) {
      login(firstSession, first.loginId());
      login(secondSession, first.loginId());
      long id = create(firstSession, first, "양파 1kg", "WEIGHT", 1000);
      assertThat(
              firstSession
                  .put(
                      windowPath(first, DATE),
                      "{\"startTime\":\"14:00\",\"endTime\":\"18:00\",\"orderDeadline\":\"13:00\"}",
                      true)
                  .statusCode())
          .isEqualTo(200);
      var publishing =
          firstSession.putAsync(
              offerPath(first, id, DATE), "{\"priceWon\":1000,\"onlineQuantity\":10}");
      var modifying =
          secondSession.putAsync(
              productPath(first) + "/" + id, productJson("양파 500g", "WEIGHT", 500, "변경"));
      HttpResponse<String> published = publishing.get(30, java.util.concurrent.TimeUnit.SECONDS);
      HttpResponse<String> modified = modifying.get(30, java.util.concurrent.TimeUnit.SECONDS);
      assertThat(published.statusCode()).isEqualTo(200);
      assertThat(modified.statusCode()).isIn(200, 409);
      long offerId = firstSession.json(published).get("id").asLong();
      JsonNode detail = firstSession.json(firstSession.get(searchPath(first) + "/" + offerId));
      int expectedAmount = modified.statusCode() == 200 ? 500 : 1000;
      assertThat(detail.get("unitAmount").asInt()).isEqualTo(expectedAmount);
      assertThat(detail.get("productName").asString())
          .isEqualTo(expectedAmount == 500 ? "양파 500g" : "양파 1kg");
      var updateA =
          firstSession.putAsync(
              offerPath(first, id, DATE), "{\"priceWon\":2000,\"onlineQuantity\":20}");
      var updateB =
          secondSession.putAsync(
              offerPath(first, id, DATE), "{\"priceWon\":3000,\"onlineQuantity\":30}");
      for (var future : List.of(updateA, updateB)) {
        HttpResponse<String> response = future.get(30, java.util.concurrent.TimeUnit.SECONDS);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(firstSession.json(response).get("id").asLong()).isEqualTo(offerId);
      }
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM daily_offers WHERE product_id = ?", Long.class, id))
          .isEqualTo(1L);
      JsonNode saved = firstSession.json(firstSession.get(searchPath(first) + "/" + offerId));
      int price = saved.get("priceWon").asInt();
      assertThat(price).isIn(2000, 3000);
      assertThat(saved.get("onlineQuantity").asInt()).isEqualTo(price / 100);
    }
  }

  private record Seller(String loginId, long storeId, long marketId) {}

  @TestConfiguration(proxyBeanMethods = false)
  static class TimeConfig {
    @Bean
    @Primary
    TestClock testClock() {
      return new TestClock();
    }
  }

  static class TestClock extends Clock {
    private final AtomicReference<Instant> value =
        new AtomicReference<>(Instant.parse("2026-10-13T03:00:00Z"));

    void set(Instant instant) {
      value.set(instant);
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return Clock.fixed(value.get(), zone);
    }

    @Override
    public Instant instant() {
      return value.get();
    }
  }
}
