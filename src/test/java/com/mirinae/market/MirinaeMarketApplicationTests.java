package com.mirinae.market;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

/** 서버 기동과 핵심 HTTP 엔드포인트 응답을 검증한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MirinaeMarketApplicationTests {

  @Value("${local.server.port}")
  private int port;

  private final HttpClient httpClient = HttpClient.newHttpClient();

  private HttpResponse<String> get(String path) throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
    return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void healthEndpointIsUp() throws Exception {
    HttpResponse<String> response = get("/actuator/health");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).contains("\"status\":\"UP\"");
  }

  @Test
  void openApiSpecIsAvailable() throws Exception {
    HttpResponse<String> response = get("/v3/api-docs");

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).contains("미리내 마켓 API");
  }

  @Test
  void swaggerUiIsAvailable() throws Exception {
    HttpResponse<String> response = get("/swagger-ui/index.html");

    assertThat(response.statusCode()).isEqualTo(200);
  }
}
