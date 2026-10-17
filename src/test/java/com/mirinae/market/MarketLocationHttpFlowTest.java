package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
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
      "admin.bootstrap.enabled=true",
      "admin.bootstrap.login-id=first_admin",
      "admin.bootstrap.password=Admin1234!",
      "admin.bootstrap.email=admin@example.com"
    })
@Import(PostgresTestConfig.class)
class MarketLocationHttpFlowTest {
  @Value("${local.server.port}")
  private int port;

  @Autowired private AccountService accounts;
  @Autowired private JdbcTemplate jdbc;

  private HttpSessionClient admin() throws Exception {
    var client = new HttpSessionClient(port);
    client.refreshCsrf();
    assertThat(client.login("first_admin", "Admin1234!").statusCode()).isEqualTo(200);
    client.refreshCsrf();
    return client;
  }

  private static String name() {
    return "m" + UUID.randomUUID().toString().replace("-", "");
  }

  private static String input(String name, String region, double latitude) {
    return "{\"name\":\""
        + name
        + "\",\"regionCode\":\""
        + region
        + "\",\"address\":\"서울특별시 종로구 창경궁로 88\",\"latitude\":"
        + latitude
        + ",\"longitude\":127.0}";
  }

  @Test
  void completeLocationRequiredRegionalUniquenessAndAtomicAudit() throws Exception {
    try (var admin = admin()) {
      String name = name();
      assertThat(
              admin
                  .post(
                      "/api/admin/markets", "{\"name\":\"" + name + "\"}", "application/json", true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(
              admin
                  .post("/api/admin/markets", input(name, "00000", 37.5), "application/json", true)
                  .statusCode())
          .isEqualTo(400);
      var created =
          admin.post("/api/admin/markets", input(name, "11110", 37.5), "application/json", true);
      assertThat(created.statusCode()).isEqualTo(201);
      long id = admin.json(created).get("id").asLong();
      assertThat(
              admin
                  .post("/api/admin/markets", input(name, "11110", 37.5), "application/json", true)
                  .statusCode())
          .isEqualTo(409);
      assertThat(
              admin
                  .post("/api/admin/markets", input(name, "11140", 37.5), "application/json", true)
                  .statusCode())
          .isEqualTo(201);
      assertThat(
              admin.put("/api/admin/markets/" + id, input(name, "11110", 37.51), true).statusCode())
          .isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='MARKET' AND target_id=?",
                  Long.class,
                  id))
          .isEqualTo(2L);
      assertThat(jdbc.queryForObject("SELECT latitude FROM markets WHERE id=?", Double.class, id))
          .isEqualTo(37.51);
      assertThat(
              admin.put("/api/admin/markets/" + id, input(name, "11140", 37.52), true).statusCode())
          .isEqualTo(409);
      assertThat(jdbc.queryForObject("SELECT latitude FROM markets WHERE id=?", Double.class, id))
          .isEqualTo(37.51);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM administrator_changes WHERE target_type='MARKET' AND target_id=?",
                  Long.class,
                  id))
          .isEqualTo(2L);
      assertThat(
              admin
                  .put(
                      "/api/admin/markets/" + id,
                      "{\"name\":\"" + name + "\",\"address\":\"불완전 변경\"}",
                      true)
                  .statusCode())
          .isEqualTo(400);
    }
  }

  @Test
  void candidateRegionsFilterBeforePaginationWithoutAddressInput() throws Exception {
    String prefix = name();
    try (var admin = admin()) {
      for (int i = 0; i < 57; i++) {
        jdbc.update(
            "INSERT INTO market_candidates(id,name,region_code,address,latitude,longitude,source_date) VALUES (?,?,?,?,37.5,127.0,'2025-11-10')",
            prefix + i,
            prefix + String.format("%02d", i),
            i < 55 ? "11110" : "11140",
            "공공자료 주소");
      }
      var first =
          admin.get(
              "/api/admin/market-candidates?query=" + prefix + "&provinceCode=11&regionCode=11110");
      assertThat(first.statusCode()).isEqualTo(200);
      assertThat(admin.json(first).size()).isEqualTo(51);
      for (var item : admin.json(first))
        assertThat(item.get("regionCode").asString()).isEqualTo("11110");
      var second =
          admin.get("/api/admin/market-candidates?query=" + prefix + "&regionCode=11110&page=1");
      assertThat(admin.json(second).size()).isEqualTo(5);
      assertThat(admin.json(second).get(0).get("id").asString())
          .isNotEqualTo(admin.json(first).get(0).get("id").asString());
      var regional = admin.get("/api/admin/market-candidates?provinceCode=11&regionCode=11110");
      assertThat(admin.json(regional).size()).isGreaterThan(0);
      for (var item : admin.json(regional))
        assertThat(item.get("regionCode").asString()).isEqualTo("11110");
      assertThat(admin.get("/api/admin/market-candidates?provinceCode=00").statusCode())
          .isEqualTo(400);
      assertThat(admin.get("/api/admin/market-candidates?regionCode=00000").statusCode())
          .isEqualTo(400);
      assertThat(
              admin
                  .get("/api/admin/market-candidates?provinceCode=26&regionCode=11110")
                  .statusCode())
          .isEqualTo(400);
    } finally {
      jdbc.update("DELETE FROM market_candidates WHERE position(? in id)=1", prefix);
    }
  }

  @Test
  void onlyConnectedSellerMarketsAreListedAndNearbyFiltersWithoutExternalMaps() throws Exception {
    String buyer = name().substring(0, 16);
    accounts.signup(buyer, "Buyer1234!", "구매자", buyer + "@example.com");
    String seller = name().substring(0, 16);
    var owner =
        accounts.registerSeller(
            seller, "Seller1234!", seller + "@example.com", "김담당", "01012345678");
    try (var admin = admin();
        var client = new HttpSessionClient(port)) {
      String visible = name();
      var response =
          admin.post("/api/admin/markets", input(visible, "11110", 37.5), "application/json", true);
      assertThat(response.statusCode()).isEqualTo(201);
      long id = admin.json(response).get("id").asLong();
      String hidden = name();
      assertThat(
              admin
                  .post(
                      "/api/admin/markets", input(hidden, "11110", 37.5), "application/json", true)
                  .statusCode())
          .isEqualTo(201);
      long legacy =
          jdbc.queryForObject(
              "INSERT INTO markets(name) VALUES (?) RETURNING id", Long.class, name());
      jdbc.update(
          "INSERT INTO stores(market_id,owner_account_id,name) VALUES (?,?,?)",
          legacy,
          owner.id(),
          "기존매장");
      client.refreshCsrf();
      assertThat(client.login(buyer, "Buyer1234!").statusCode()).isEqualTo(200);
      assertThat(client.get("/api/markets").body())
          .doesNotContain(visible, hidden)
          .contains("위치 미등록");
      jdbc.update("UPDATE stores SET market_id=? WHERE owner_account_id=?", id, owner.id());
      assertThat(client.get("/api/markets?regionCode=11110").body())
          .contains(visible)
          .doesNotContain(hidden);
      assertThat(client.get("/api/markets?latitude=37.5&longitude=127.0").body())
          .contains(visible, "distanceKm");
      assertThat(client.get("/api/markets?latitude=35&longitude=127.0").body())
          .doesNotContain(visible);
      assertThat(client.get("/api/markets?latitude=37.5").statusCode()).isEqualTo(400);
      assertThat(client.get("/api/markets?latitude=NaN&longitude=127").statusCode()).isEqualTo(400);
      assertThat(client.get("/api/market-regions").statusCode()).isEqualTo(200);
      assertThat(client.get("/api/admin/market-candidates").statusCode()).isEqualTo(403);
      assertThat(admin.get("/api/admin/market-candidates?query=성정시장").body()).contains("성정시장");
      assertThat(jdbc.queryForObject("SELECT count(*) FROM market_candidates", Long.class))
          .isEqualTo(1393L);
    }
  }
}
