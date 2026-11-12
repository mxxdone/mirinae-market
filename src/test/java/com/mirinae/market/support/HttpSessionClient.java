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

/**
 * 실제 HTTP로 인증 흐름을 검증하는 테스트 클라이언트다. refresh 쿠키는 쿠키 저장소로, access는 메모리 필드로 유지하며 보호 요청에 Authorization:
 * Bearer를 붙인다.
 */
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
  private String accessToken;

  public HttpSessionClient(int port) {
    baseUrl = "http://localhost:" + port;
  }

  public HttpResponse<String> get(String path) throws Exception {
    return send(request("GET", path, "", null, false));
  }

  public JsonNode json(HttpResponse<String> response) {
    return mapper.readTree(response.body());
  }

  public void refreshCsrf() throws Exception {
    csrf = json(get("/api/auth/csrf")).get("token").asString();
  }

  /** multipart 업로드다. CSRF 쿠키와 헤더를 함께 보내야 하므로 세션의 쿠키 저장소를 쓰는 client로 전송한다. */
  public HttpResponse<String> postMultipart(String path, String boundary, byte[] content)
      throws Exception {
    byte[] prefix =
        ("--"
                + boundary
                + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.png\"\r\nContent-Type: image/png\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8);
    byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
    byte[] body = new byte[prefix.length + content.length + suffix.length];
    System.arraycopy(prefix, 0, body, 0, prefix.length);
    System.arraycopy(content, 0, body, prefix.length, content.length);
    System.arraycopy(suffix, 0, body, prefix.length + content.length, suffix.length);
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(java.time.Duration.ofSeconds(30))
            .header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .header("X-CSRF-TOKEN", csrf)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
    if (accessToken != null) request.header("Authorization", "Bearer " + accessToken);
    return send(request.build());
  }

  public String accessToken() {
    return accessToken;
  }

  /** 현재 브라우저의 CSRF 토큰 값이다. */
  public String csrfValue() {
    return csrf;
  }

  /** 현재 브라우저의 refresh 쿠키 값이다. 다른 기기 로그인 검증에 사용한다. */
  public String refreshCookie() {
    return cookies.getCookieStore().getCookies().stream()
        .filter(cookie -> cookie.getName().equals("MIRINAE_REFRESH"))
        .map(java.net.HttpCookie::getValue)
        .findFirst()
        .orElse("");
  }

  /** OAuth 흐름 쿠키 값이다. */
  public String flowCookie() {
    return cookies.getCookieStore().getCookies().stream()
        .filter(cookie -> cookie.getName().equals("MIRINAE_OAUTH_FLOW"))
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

  public HttpResponse<String> patch(String path, String body, boolean includeCsrf)
      throws Exception {
    return mutation("PATCH", path, body, "application/json", includeCsrf);
  }

  public HttpResponse<String> delete(String path, boolean includeCsrf) throws Exception {
    return mutation("DELETE", path, "", "application/json", includeCsrf);
  }

  public java.util.concurrent.CompletableFuture<HttpResponse<String>> putAsync(
      String path, String body) {
    return client.sendAsync(
        mutationRequest("PUT", path, body, "application/json", true),
        HttpResponse.BodyHandlers.ofString());
  }

  public java.util.concurrent.CompletableFuture<HttpResponse<String>> postAsync(
      String path, String body) {
    return client.sendAsync(
        mutationRequest("POST", path, body, "application/json", true),
        HttpResponse.BodyHandlers.ofString());
  }

  public HttpResponse<String> putWithInventoryVersion(String path, String body, boolean includeCsrf)
      throws Exception {
    return put(path, withCurrentVersions(path, body), includeCsrf);
  }

  public java.util.concurrent.CompletableFuture<HttpResponse<String>> putWithInventoryVersionAsync(
      String path, String body) throws Exception {
    return putAsync(path, withCurrentVersions(path, body));
  }

  private String withCurrentVersions(String path, String body) throws Exception {
    var match =
        java.util.regex.Pattern.compile(
                "/api/seller/stores/(\\d+)/(?:sales/(\\d{4}-\\d{2}-\\d{2})|products/(\\d+)/offers/(\\d{4}-\\d{2}-\\d{2}))")
            .matcher(path);
    if (!match.matches()) return body;
    String date = match.group(2) != null ? match.group(2) : match.group(4);
    var response = get("/api/seller/stores/" + match.group(1) + "/sales/" + date + "?size=100");
    if (response.statusCode() != 200) return body;
    var items = json(response).get("items");
    var root = mapper.readTree(body);
    if (!root.isObject()) return body;
    var changes = match.group(2) != null ? root.get("products") : null;
    if (match.group(2) != null && (changes == null || !changes.isArray())) return body;
    var nodes = new java.util.ArrayList<tools.jackson.databind.JsonNode>();
    if (changes == null) nodes.add(root);
    else for (var change : changes) nodes.add(change);
    for (var node : nodes) {
      if (!node.isObject() || node.has("inventoryVersion")) continue;
      var id = node.get("productId");
      long productId =
          match.group(3) != null ? Long.parseLong(match.group(3)) : (id == null ? -1 : id.asLong());
      for (var row : items)
        if (row.get("product").get("id").asLong() == productId) {
          var version = row.get("inventoryVersion");
          if (version != null && !version.isNull())
            ((tools.jackson.databind.node.ObjectNode) node)
                .put("inventoryVersion", version.asLong());
        }
    }
    return mapper.writeValueAsString(root);
  }

  private HttpResponse<String> mutation(
      String method, String path, String body, String contentType, boolean includeCsrf)
      throws Exception {
    return send(request(method, path, body, contentType, includeCsrf));
  }

  private HttpResponse<String> send(HttpRequest request) throws Exception {
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private HttpRequest request(
      String method, String path, String body, String contentType, boolean includeCsrf) {
    HttpRequest.BodyPublisher publisher =
        (body == null || body.isEmpty()) && "GET".equals(method)
            ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(body == null ? "" : body);
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(java.time.Duration.ofSeconds(20))
            .method(method, publisher);
    if (contentType != null) request.header("Content-Type", contentType);
    if (includeCsrf) request.header("X-CSRF-TOKEN", csrf);
    if (accessToken != null) request.header("Authorization", "Bearer " + accessToken);
    return request.build();
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
    if (accessToken != null) {
      request.header("Authorization", "Bearer " + accessToken);
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

  /** 로컬 로그인 후 access를 메모리에 보관한다. */
  public HttpResponse<String> login(String loginId, String password) throws Exception {
    HttpResponse<String> response =
        post(
            "/api/auth/login",
            "loginId="
                + URLEncoder.encode(loginId, StandardCharsets.UTF_8)
                + "&password="
                + URLEncoder.encode(password, StandardCharsets.UTF_8),
            "application/x-www-form-urlencoded",
            true);
    if (response.statusCode() == 200) {
      var node = json(response);
      if (node.has("accessToken")) accessToken = node.get("accessToken").asString();
    }
    return response;
  }

  /** refresh 쿠키로 access를 복원한다. */
  public HttpResponse<String> refresh() throws Exception {
    HttpResponse<String> response =
        post("/api/auth/refresh", "", "application/x-www-form-urlencoded", true);
    if (response.statusCode() == 200) {
      var node = json(response);
      if (node.has("accessToken")) accessToken = node.get("accessToken").asString();
    }
    return response;
  }

  public HttpResponse<String> logout() throws Exception {
    return post("/api/auth/logout", "", "application/x-www-form-urlencoded", true);
  }

  /** 이미 사용한 refresh 쿠키를 그대로 다시 보낸다. 쿠키 저장소가 현재 값을 덧붙이지 않도록 별도 HttpClient를 쓴다. */
  public HttpResponse<String> replayRefresh(String refresh) throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(baseUrl + "/api/auth/refresh"))
            .timeout(java.time.Duration.ofSeconds(20))
            .header("Cookie", "MIRINAE_REFRESH=" + refresh + "; MIRINAE_CSRF=" + csrf)
            .header("X-CSRF-TOKEN", csrf)
            .POST(HttpRequest.BodyPublishers.noBody())
            .build();
    try (HttpClient isolated = HttpClient.newHttpClient()) {
      return isolated.send(request, HttpResponse.BodyHandlers.ofString());
    }
  }

  /** 로그인 전 잔여 인증 상태(메모리 토큰·쿠키)를 모두 비운다. */
  public void clearAuthState() {
    accessToken = null;
    csrf = null;
    cookies.getCookieStore().removeAll();
  }

  public void clearAccessToken() {
    accessToken = null;
  }

  /** 임의 응답(소셜 가입·연결 등)에서 access를 메모리에 보관한다. JSON 객체가 아니면 기존 값을 유지한다. */
  public void captureAccess(HttpResponse<String> response) {
    String body = response.body();
    if (response.statusCode() != 200
        || body == null
        || body.isBlank()
        || !body.stripLeading().startsWith("{")) {
      return;
    }
    var node = json(response);
    if (node.has("accessToken") && !node.get("accessToken").isNull()) {
      accessToken = node.get("accessToken").asString();
    }
  }

  @Override
  public void close() {
    client.close();
  }
}
