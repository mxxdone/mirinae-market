package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.product.business.ProductService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.modules.store.business.StoreView;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({
  PostgresTestConfig.class,
  RedisTestConfig.class,
  StoreDiscoveryHttpFlowTest.TimeConfig.class
})
class StoreDiscoveryHttpFlowTest {
  private static final String PASSWORD = "Pass1234!";
  private static final LocalDate DATE = LocalDate.of(2026, 10, 13);

  @Value("${local.server.port}")
  private int port;

  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private ProductService products;
  @Autowired private JdbcTemplate jdbc;
  private String buyer;
  private String firstSeller;
  private StoreView first;
  private StoreView second;
  private StoreView other;

  @BeforeEach
  void fixtures() {
    String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    buyer = "u" + suffix;
    accounts.ensureDemoAccount(buyer, PASSWORD, "구매자", buyer + "@example.com", "BUYER");
    firstSeller = "a" + suffix;
    first = seller(firstSeller, "시장" + suffix, "과일%_Apple");
    second = seller("b" + suffix, "시장" + suffix, "두번째");
    other = seller("c" + suffix, "다른시장" + suffix, "다른매장");
  }

  private StoreView seller(String id, String market, String name) {
    accounts.ensureDemoAccount(id, PASSWORD, "판매자", id + "@example.com", "SELLER");
    return stores.ensureDemoStore(id, market, name);
  }

  private HttpSessionClient login() throws Exception {
    HttpSessionClient session = new HttpSessionClient(port);
    session.refreshCsrf();
    assertThat(session.login(buyer, PASSWORD).statusCode()).isEqualTo(200);
    return session;
  }

  private String base() {
    return "/api/markets/" + first.marketId() + "/stores";
  }

  @Test
  void listsEmptySellingStoresWithLiteralSearchAndNoPrivateFields() throws Exception {
    try (var session = login()) {
      var result = session.get(base() + "?size=1");
      assertThat(result.statusCode()).isEqualTo(200);
      var page = session.json(result);
      assertThat(page.get("totalItems").asInt()).isEqualTo(2);
      assertThat(page.get("hasNext").asBoolean()).isTrue();
      assertThat(page.get("items").get(0).get("id").asLong()).isEqualTo(first.id());
      assertThat(
              session
                  .json(session.get(base() + "?size=1&page=1"))
                  .get("items")
                  .get(0)
                  .get("id")
                  .asLong())
          .isEqualTo(second.id());
      for (String query : new String[] {"%25_", "apple"}) {
        assertThat(session.json(session.get(base() + "?query=" + query)).get("totalItems").asInt())
            .isEqualTo(1);
      }
      var detail = session.get(base() + "/" + first.id());
      assertThat(detail.statusCode()).isEqualTo(200);
      assertThat(session.json(detail).size()).isEqualTo(3);
      assertThat(detail.body()).doesNotContain("owner", "loginId", "email", "phone", "contact");
      assertThat(
              session.json(session.get(base() + "/" + first.id() + "/offers")).get("items").size())
          .isZero();
    }
  }

  @Test
  void rejectsAnonymousInvalidParametersAndHiddenStoresConsistently() throws Exception {
    try (var session = login();
        var anonymous = new HttpSessionClient(port)) {
      for (String path :
          new String[] {base(), base() + "/" + first.id(), base() + "/" + first.id() + "/offers"}) {
        assertThat(anonymous.get(path).statusCode()).isEqualTo(401);
      }
      for (String params :
          new String[] {
            "page=-1", "size=0", "size=101", "page=2147483647", "query=" + "x".repeat(101)
          }) {
        assertThat(session.get(base() + "?" + params).statusCode()).isEqualTo(400);
        assertThat(session.get(base() + "/" + first.id() + "/offers?" + params).statusCode())
            .isEqualTo(400);
      }
      jdbc.update("UPDATE stores SET suspended=true WHERE id=?", first.id());
      for (long id : new long[] {first.id(), other.id(), Long.MAX_VALUE}) {
        assertThat(session.get(base() + "/" + id).statusCode()).isEqualTo(404);
        assertThat(session.get(base() + "/" + id + "/offers").statusCode()).isEqualTo(404);
      }
      jdbc.update("UPDATE accounts SET role='BUYER' WHERE login_id=?", firstSeller);
      jdbc.update("UPDATE stores SET suspended=false WHERE id=?", first.id());
      assertThat(session.get(base() + "/" + first.id()).statusCode()).isEqualTo(404);
      assertThat(session.json(session.get(base())).get("totalItems").asInt()).isEqualTo(1);
    }
  }

  @Test
  void scopesOffersBeforePaginationAndCountAndKeepsExistingPublicRules() throws Exception {
    products.window(
        firstSeller,
        first.id(),
        DATE,
        LocalTime.of(14, 0),
        LocalTime.of(18, 0),
        LocalTime.of(13, 0));
    for (int index = 0; index < 3; index++) {
      long product = products.create(firstSeller, first.id(), "사과" + index, "", "COUNT", 1).id();
      products.offer(firstSeller, first.id(), product, DATE, 1000, index, null);
    }
    try (var session = login()) {
      String path = base() + "/" + first.id() + "/offers";
      var response = session.get(path + "?size=2");
      assertThat(response.statusCode()).isEqualTo(200);
      var page = session.json(response);
      assertThat(page.get("totalItems").asInt()).isEqualTo(3);
      assertThat(page.get("items").size()).isEqualTo(2);
      assertThat(page.get("items").get(0).get("onlineQuantity").asInt()).isZero();
      assertThat(page.get("hasNext").asBoolean()).isTrue();
      var last = session.json(session.get(path + "?size=2&page=1"));
      assertThat(last.get("items").size()).isEqualTo(1);
      assertThat(last.get("hasNext").asBoolean()).isFalse();
      assertThat(
              session
                  .json(session.get(base() + "/" + second.id() + "/offers"))
                  .get("totalItems")
                  .asInt())
          .isZero();
      assertThat(
              session
                  .json(session.get("/api/markets/" + first.marketId() + "/offers"))
                  .get("totalItems")
                  .asInt())
          .isEqualTo(3);
      jdbc.update(
          "UPDATE daily_offers SET active=false WHERE id=?",
          page.get("items").get(0).get("id").asLong());
      jdbc.update(
          "UPDATE products SET archived_at=now() WHERE id=?",
          page.get("items").get(1).get("productId").asLong());
      assertThat(session.json(session.get(path)).get("totalItems").asInt()).isEqualTo(1);
      jdbc.update("UPDATE pickup_windows SET order_deadline='12:00' WHERE store_id=?", first.id());
      assertThat(session.json(session.get(path)).get("totalItems").asInt()).isZero();
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class TimeConfig {
    @Bean
    @Primary
    Clock clock() {
      return Clock.fixed(Instant.parse("2026-10-13T03:00:00Z"), ZoneOffset.UTC);
    }
  }
}
