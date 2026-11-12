package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.product.business.ProductImageService;
import com.mirinae.market.modules.product.business.ProductService;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.support.HttpSessionClient;
import com.mirinae.market.support.PostgresTestConfig;
import com.mirinae.market.support.RedisTestConfig;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import javax.imageio.ImageIO;
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

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "product.images.root=.local/test-uploads/product-image-http",
      "product.images.cleanup-initial-delay-ms=86400000"
    })
@Import({
  PostgresTestConfig.class,
  RedisTestConfig.class,
  ProductImageHttpFlowTest.TimeConfig.class
})
class ProductImageHttpFlowTest {
  private static final String PASSWORD = "Pass1234!";

  @Value("${local.server.port}")
  private int port;

  @Autowired private AccountService accounts;
  @Autowired private StoreService stores;
  @Autowired private ProductService products;
  @Autowired private ProductImageService images;
  @Autowired private JdbcTemplate jdbc;
  private String seller;
  private long store;
  private long market;

  @BeforeEach
  void setup() {
    seller = "im" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    accounts.ensureDemoAccount(seller, PASSWORD, "사진판매자", seller + "@example.com", "SELLER");
    var owned = stores.ensureDemoStore(seller, "사진시장" + seller, "사진매장");
    store = owned.id();
    market = owned.marketId();
  }

  private HttpSessionClient login() throws Exception {
    var session = new HttpSessionClient(port);
    session.refreshCsrf();
    assertThat(session.login(seller, PASSWORD).statusCode()).isEqualTo(200);
    session.refreshCsrf();
    return session;
  }

  private String base() {
    return "/api/seller/stores/" + store;
  }

  private static byte[] png(int width, int height) throws Exception {
    var bytes = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "PNG", bytes);
    return bytes.toByteArray();
  }

  private HttpResponse<String> upload(HttpSessionClient session, byte[] bytes, boolean csrf)
      throws Exception {
    if (!csrf) {
      // CSRF 토큰을 일부러 빼고 보내야 하는 경계 검증이다.
      return uploadWithoutCsrf(session, bytes);
    }
    return session.postMultipart(base() + "/product-images", "image-test-boundary", bytes);
  }

  private HttpResponse<String> uploadWithoutCsrf(HttpSessionClient session, byte[] bytes)
      throws Exception {
    String boundary = "image-test-boundary";
    var output = new ByteArrayOutputStream();
    output.write(
        ("--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.png\"\r\nContent-Type: image/png\r\n\r\n")
            .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    output.write(bytes);
    output.write(
        ("\r\n--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
    var request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + base() + "/product-images"))
            .header("Authorization", "Bearer " + session.accessToken())
            .header("Content-Type", "multipart/form-data; boundary=" + boundary);
    try (var client = HttpClient.newHttpClient()) {
      return client.send(
          request.POST(HttpRequest.BodyPublishers.ofByteArray(output.toByteArray())).build(),
          HttpResponse.BodyHandlers.ofString());
    }
  }

  private String input(String image) {
    return "{\"name\":\"사진 상품\",\"unitType\":\"COUNT\",\"unitAmount\":1,\"description\":\"\",\"imageId\":\""
        + image
        + "\"}";
  }

  @Test
  void uploadAttachReplaceRemoveAndGracePeriodAreConsistent() throws Exception {
    try (var session = login()) {
      var upload = upload(session, png(1200, 600), true);
      assertThat(upload.statusCode()).isEqualTo(200);
      var photo = session.json(upload);
      String id = photo.get("id").asString();
      assertThat(photo.get("variants").get(0).get("width").asInt()).isEqualTo(256);
      assertThat(photo.get("variants").get(0).get("height").asInt()).isEqualTo(128);
      long product =
          session
              .json(session.post(base() + "/products", input(id), "application/json", true))
              .get("id")
              .asLong();
      var current = session.json(session.get(base() + "/products/" + product + "/image"));
      assertThat(current.get("image").get("id").asString()).isEqualTo(id);
      assertThat(
              session
                  .json(
                      session.get(
                          "/api/markets/" + market + "/product-images?productIds=" + product))
                  .size())
          .isEqualTo(1);
      String next = session.json(upload(session, png(1, 1), true)).get("id").asString();
      assertThat(session.put(base() + "/products/" + product, input(next), true).statusCode())
          .isEqualTo(200);
      assertThat(
              jdbc.queryForObject(
                  "SELECT state FROM product_images WHERE id=?", String.class, UUID.fromString(id)))
          .isEqualTo("RETIRED");
      images.cleanUnused();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM product_images WHERE id=?",
                  Integer.class,
                  UUID.fromString(id)))
          .isEqualTo(1);
      jdbc.update(
          "UPDATE product_images SET delete_after='2026-10-12T00:00:00Z' WHERE id=?",
          UUID.fromString(id));
      images.cleanUnused();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM product_images WHERE id=?",
                  Integer.class,
                  UUID.fromString(id)))
          .isZero();
      assertThat(session.put(base() + "/products/" + product, input(""), true).statusCode())
          .isEqualTo(200);
      assertThat(
              session
                  .json(session.get(base() + "/products/" + product + "/image"))
                  .get("image")
                  .isNull())
          .isTrue();
    }
  }

  @Test
  void publicFileWorksWithoutAuthenticationAndMalformedUploadsKeepProduct() throws Exception {
    try (var session = login();
        var client = HttpClient.newHttpClient()) {
      var photo = session.json(upload(session, png(1, 1), true));
      assertThat(photo.get("variants").get(2).get("width").asInt()).isEqualTo(1);
      String url = photo.get("variants").get(0).get("url").asString();
      var response =
          client.send(
              HttpRequest.newBuilder(URI.create("http://localhost:" + port + url)).GET().build(),
              HttpResponse.BodyHandlers.ofByteArray());
      assertThat(response.statusCode()).isEqualTo(200);
      assertThat(ImageIO.read(new java.io.ByteArrayInputStream(response.body())).getWidth())
          .isEqualTo(1);
      assertThat(
              upload(session, "not a photo".getBytes(java.nio.charset.StandardCharsets.UTF_8), true)
                  .statusCode())
          .isEqualTo(400);
      assertThat(upload(session, png(2, 2), false).statusCode()).isEqualTo(403);
    }
  }

  @Test
  void foreignAndExpiredImageCannotAttachAndCreateRollsBack() throws Exception {
    try (var session = login()) {
      var photo = session.json(upload(session, png(10, 10), true));
      String id = photo.get("id").asString();
      String other = seller + "b";
      accounts.ensureDemoAccount(other, PASSWORD, "판매자", other + "@example.com", "SELLER");
      var foreign = stores.ensureDemoStore(other, "다른시장" + seller, "다른매장");
      jdbc.update(
          "UPDATE product_images SET store_id=? WHERE id=?", foreign.id(), UUID.fromString(id));
      long before = products.products(seller, store, 0, 20).totalItems();
      assertThat(
              session.post(base() + "/products", input(id), "application/json", true).statusCode())
          .isEqualTo(403);
      assertThat(products.products(seller, store, 0, 20).totalItems()).isEqualTo(before);
      jdbc.update(
          "UPDATE product_images SET store_id=?,delete_after='2026-10-12T00:00:00Z' WHERE id=?",
          store,
          UUID.fromString(id));
      assertThat(
              session.post(base() + "/products", input(id), "application/json", true).statusCode())
          .isEqualTo(409);
    }
  }

  @Test
  void cleanupFailureCanRetryAndLegacyUpdateKeepsImageUntilArchive() throws Exception {
    try (var session = login()) {
      String id = session.json(upload(session, png(4, 4), true)).get("id").asString();
      var product = products.create(seller, store, "사진 상품", "", "COUNT", 1, id);
      products.update(seller, store, product.id(), "사진 상품", "설명 수정", "COUNT", 1);
      assertThat(images.current(seller, store, product.id()).id()).isEqualTo(id);
      products.archive(seller, store, product.id());
      assertThat(
              jdbc.queryForObject(
                  "SELECT state FROM product_images WHERE id=?", String.class, UUID.fromString(id)))
          .isEqualTo("RETIRED");
      jdbc.update(
          "UPDATE product_images SET delete_after='2026-10-12T00:00:00Z' WHERE id=?",
          UUID.fromString(id));
      var extra =
          java.nio.file.Path.of(".local/test-uploads/product-image-http", id, "unexpected.tmp");
      java.nio.file.Files.writeString(extra, "test");
      try {
        org.assertj.core.api.Assertions.assertThatThrownBy(images::cleanUnused)
            .isInstanceOf(java.io.UncheckedIOException.class);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM product_images WHERE id=?",
                    Integer.class,
                    UUID.fromString(id)))
            .isEqualTo(1);
      } finally {
        java.nio.file.Files.deleteIfExists(extra);
      }
      images.cleanUnused();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM product_images WHERE id=?",
                  Integer.class,
                  UUID.fromString(id)))
          .isZero();
    }
  }

  @TestConfiguration
  static class TimeConfig {
    @Bean
    @Primary
    Clock imageClock() {
      return Clock.fixed(Instant.parse("2026-10-13T03:00:00Z"), ZoneOffset.UTC);
    }
  }
}
