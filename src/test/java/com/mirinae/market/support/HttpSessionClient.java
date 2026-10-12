package com.mirinae.market.support;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class HttpSessionClient implements AutoCloseable {
  private final String baseUrl;
  private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
  private final HttpClient client =
      HttpClient.newBuilder()
          .connectTimeout(java.time.Duration.ofSeconds(10))
          .cookieHandler(cookies)
          .build();
  private final JsonMapper mapper = JsonMapper.builder().build();
  private String csrf;

  public HttpSessionClient(int port) {
    baseUrl = "http://localhost:" + port;
  }

  public HttpResponse<String> get(String path) throws Exception {
    return client.send(
        HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(java.time.Duration.ofSeconds(20))
            .GET()
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  public JsonNode json(HttpResponse<String> response) {
    return mapper.readTree(response.body());
  }

  public void refreshCsrf() throws Exception {
    csrf = json(get("/api/auth/csrf")).get("token").asString();
  }

  public String sessionId() {
    return cookies.getCookieStore().getCookies().stream()
        .filter(cookie -> cookie.getName().equals("JSESSIONID"))
        .map(java.net.HttpCookie::getValue)
        .findFirst()
        .orElse("");
  }

  public HttpResponse<String> post(
      String path, String body, String contentType, boolean includeCsrf) throws Exception {
    return mutation("POST", path, body, contentType, includeCsrf);
  }

  public HttpResponse<String> put(String path, String body, boolean includeCsrf) throws Exception {
    return mutation("PUT", path, body, "application/json", includeCsrf);
  }

  public java.util.concurrent.CompletableFuture<HttpResponse<String>> putAsync(
      String path, String body) {
    return client.sendAsync(
        mutationRequest("PUT", path, body, "application/json", true),
        HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> mutation(
      String method, String path, String body, String contentType, boolean includeCsrf)
      throws Exception {
    return client.send(
        mutationRequest(method, path, body, contentType, includeCsrf),
        HttpResponse.BodyHandlers.ofString());
  }

  private HttpRequest mutationRequest(
      String method, String path, String body, String contentType, boolean includeCsrf) {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(java.time.Duration.ofSeconds(20))
            .header("Content-Type", contentType)
            .method(method, HttpRequest.BodyPublishers.ofString(body));
    if (includeCsrf) {
      request.header("X-CSRF-TOKEN", csrf);
    }
    return request.build();
  }

  public HttpResponse<String> signup(String loginId, String email) throws Exception {
    return post(
        "/api/accounts",
        "{\"loginId\":\""
            + loginId
            + "\",\"password\":\"Pass1234!\",\"displayName\":\"시장손님\",\"email\":\""
            + email
            + "\"}",
        "application/json",
        true);
  }

  public HttpResponse<String> login(String loginId, String password) throws Exception {
    return post(
        "/api/auth/login",
        "loginId="
            + URLEncoder.encode(loginId, StandardCharsets.UTF_8)
            + "&password="
            + URLEncoder.encode(password, StandardCharsets.UTF_8),
        "application/x-www-form-urlencoded",
        true);
  }

  @Override
  public void close() {
    client.close();
  }
}
