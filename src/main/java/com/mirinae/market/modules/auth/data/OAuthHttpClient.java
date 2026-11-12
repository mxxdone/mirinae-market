package com.mirinae.market.modules.auth.data;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/**
 * 카카오·구글 OAuth 2.0 Code+PKCE 흐름과 카카오 연결 해제를 서버에서 수행한다. endpoint는 제공자별로 고정하며 요청·환경에서 임의 host로 교체하지
 * 않는다. 제공자 토큰·오류 raw body는 로그에 남기지 않는다.
 */
@Component
public class OAuthHttpClient implements OAuthProviderClient {
  private static final String KAKAO_BASE = "https://kauth.kakao.com";
  private static final String KAKAO_API = "https://kapi.kakao.com";
  private static final String GOOGLE_BASE = "https://accounts.google.com";
  private static final String GOOGLE_API = "https://oauth2.googleapis.com";
  private static final String GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

  private static final java.time.Duration CONNECT_TIMEOUT = java.time.Duration.ofSeconds(2);
  private static final java.time.Duration READ_TIMEOUT = java.time.Duration.ofSeconds(3);

  private final RestClient http;
  private final String kakaoClientId;
  private final String kakaoClientSecret;
  private final String kakaoAdminKey;
  private final String googleClientId;
  private final String googleClientSecret;

  OAuthHttpClient(
      @Value("${auth.oauth.kakao.client-id:}") String kakaoClientId,
      @Value("${auth.oauth.kakao.client-secret:}") String kakaoClientSecret,
      @Value("${auth.oauth.kakao.admin-key:}") String kakaoAdminKey,
      @Value("${auth.oauth.google.client-id:}") String googleClientId,
      @Value("${auth.oauth.google.client-secret:}") String googleClientSecret) {
    var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(CONNECT_TIMEOUT);
    factory.setReadTimeout(READ_TIMEOUT);
    this.http = RestClient.builder().requestFactory(factory).build();
    this.kakaoClientId = kakaoClientId;
    this.kakaoClientSecret = kakaoClientSecret;
    this.kakaoAdminKey = kakaoAdminKey;
    this.googleClientId = googleClientId;
    this.googleClientSecret = googleClientSecret;
  }

  @Override
  public List<String> configuredProviders() {
    var providers = new java.util.ArrayList<String>(2);
    if (available("kakao")) providers.add("kakao");
    if (available("google")) providers.add("google");
    return List.copyOf(providers);
  }

  @Override
  public boolean available(String provider) {
    return switch (provider) {
      case "kakao" ->
          !kakaoClientId.isBlank() && !kakaoClientSecret.isBlank() && !kakaoAdminKey.isBlank();
      case "google" -> !googleClientId.isBlank() && !googleClientSecret.isBlank();
      default -> false;
    };
  }

  @Override
  public String authorizationUrl(
      String provider, String purpose, String state, String challenge, String redirectUri) {
    String base =
        switch (provider) {
          case "kakao" -> KAKAO_BASE + "/oauth/authorize";
          case "google" -> GOOGLE_BASE + "/o/oauth2/v2/auth";
          default -> throw new IllegalArgumentException("지원하지 않는 제공자입니다.");
        };
    boolean reauthentication = "link".equals(purpose) || "withdraw".equals(purpose);
    StringBuilder url = new StringBuilder(base).append("?response_type=code");
    url.append("&client_id=")
        .append(encode(provider.equals("kakao") ? kakaoClientId : googleClientId));
    url.append("&redirect_uri=").append(encode(redirectUri));
    url.append("&state=").append(encode(state));
    url.append("&code_challenge=").append(encode(challenge));
    url.append("&code_challenge_method=S256");
    if (provider.equals("kakao")) {
      // 카카오 로그인은 scope를 생략하고 앱의 동의항목 설정을 사용한다. 필수 권한을 강제로 덧붙이면
      // 권한이 없는 앱에서 로그인 전체가 실패할 수 있다. 재인증(link·withdraw)은 계정 선택을 위해 prompt=login.
      if (reauthentication) url.append("&prompt=login");
    } else {
      url.append("&scope=").append(encode("openid profile email"));
      url.append("&access_type=online");
      // Google은 재인증이면 계정 선택을 강제하고, 최초 로그인도 선택 화면을 보장한다.
      url.append("&prompt=select_account");
    }
    return url.toString();
  }

  @Override
  public ProviderUser exchange(
      String provider, String code, String codeVerifier, String redirectUri) {
    try {
      return switch (provider) {
        case "kakao" -> kakaoExchange(code, codeVerifier, redirectUri);
        case "google" -> googleExchange(code, codeVerifier, redirectUri);
        default -> throw new IllegalArgumentException("지원하지 않는 제공자입니다.");
      };
    } catch (org.springframework.web.client.RestClientException exception) {
      // 제공자 응답 본문·토큰은 로그에 남기지 않고 실패로만 전달한다.
      throw new OAuthProviderUnavailableException("제공자 인증을 완료하지 못했습니다.", exception);
    }
  }

  private ProviderUser kakaoExchange(String code, String codeVerifier, String redirectUri) {
    MultiValueMap<String, String> form = tokenForm(code, codeVerifier, redirectUri);
    form.add("client_id", kakaoClientId);
    form.add("client_secret", kakaoClientSecret);
    JsonNode token = postForm(KAKAO_BASE + "/oauth/token", form, null);
    String accessToken = text(token, "access_token");
    if (accessToken == null) throw new OAuthProviderUnavailableException("제공자 토큰을 확인하지 못했습니다.");
    JsonNode info = getJson(KAKAO_API + "/v2/user/me", accessToken);
    String subject = info.has("id") ? text(info, "id") : null;
    JsonNode account = info.get("kakao_account");
    String email = account == null ? null : text(account, "email");
    String displayName = null;
    if (account != null && account.get("profile") != null) {
      displayName = text(account.get("profile"), "nickname");
    }
    if (subject == null || subject.isBlank())
      throw new OAuthProviderUnavailableException("제공자 사용자 식별자를 확인하지 못했습니다.");
    return new ProviderUser("kakao", subject, displayName, email);
  }

  private ProviderUser googleExchange(String code, String codeVerifier, String redirectUri) {
    MultiValueMap<String, String> form = tokenForm(code, codeVerifier, redirectUri);
    form.add("client_id", googleClientId);
    form.add("client_secret", googleClientSecret);
    JsonNode token = postForm(GOOGLE_API + "/token", form, null);
    String accessToken = text(token, "access_token");
    if (accessToken == null) throw new OAuthProviderUnavailableException("제공자 토큰을 확인하지 못했습니다.");
    JsonNode info = getJson(GOOGLE_USERINFO, accessToken);
    String subject = text(info, "sub");
    if (subject == null || subject.isBlank())
      throw new OAuthProviderUnavailableException("제공자 사용자 식별자를 확인하지 못했습니다.");
    return new ProviderUser("google", subject, text(info, "name"), text(info, "email"));
  }

  private MultiValueMap<String, String> tokenForm(
      String code, String codeVerifier, String redirectUri) {
    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("grant_type", "authorization_code");
    form.add("redirect_uri", redirectUri);
    form.add("code", code);
    form.add("code_verifier", codeVerifier);
    return form;
  }

  private JsonNode postForm(String uri, MultiValueMap<String, String> form, String bearer) {
    var request =
        http.post().uri(uri).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form);
    if (bearer != null) request.header("Authorization", "Bearer " + bearer);
    JsonNode body = request.retrieve().body(JsonNode.class);
    if (body == null) throw new OAuthProviderUnavailableException("제공자 응답을 확인하지 못했습니다.");
    return body;
  }

  private JsonNode getJson(String uri, String bearer) {
    JsonNode body =
        http.get()
            .uri(uri)
            .header("Authorization", "Bearer " + bearer)
            .retrieve()
            .body(JsonNode.class);
    if (body == null) throw new OAuthProviderUnavailableException("제공자 응답을 확인하지 못했습니다.");
    return body;
  }

  @Override
  public void unlink(String provider, String subject) {
    if (!provider.equals("kakao")) return;
    if (!available("kakao")) {
      throw new OAuthProviderUnavailableException("카카오 연결 해제 설정이 없습니다.");
    }
    long targetId;
    try {
      targetId = Long.parseLong(subject);
    } catch (NumberFormatException exception) {
      throw new OAuthProviderUnavailableException("카카오 사용자 식별자 형식이 올바르지 않습니다.");
    }
    MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
    form.add("target_id_type", "user_id");
    form.add("target_id", Long.toString(targetId));
    try {
      http.post()
          .uri(KAKAO_API + "/v1/user/unlink")
          .header("Authorization", "KakaoAK " + kakaoAdminKey)
          .contentType(MediaType.APPLICATION_FORM_URLENCODED)
          .body(form)
          .retrieve()
          .onStatus(
              status -> status.value() == 400,
              (request, response) -> {
                // 이미 연결이 해제된 사용자(-101)만 멱등 성공으로 본다. 그 외 400은 실패다.
                String codeNode = errorCode(response);
                if ("-101".equals(codeNode)) return;
                throw new OAuthProviderUnavailableException("카카오 연결 해제에 실패했습니다.");
              })
          .toBodilessEntity();
    } catch (org.springframework.web.client.RestClientException exception) {
      throw new OAuthProviderUnavailableException("카카오 연결 해제에 실패했습니다.", exception);
    }
  }

  private static String errorCode(org.springframework.http.client.ClientHttpResponse response) {
    try {
      JsonNode body =
          tools.jackson.databind.json.JsonMapper.builder().build().readTree(response.getBody());
      return text(body, "code");
    } catch (java.io.IOException exception) {
      return null;
    }
  }

  private static String text(JsonNode node, String field) {
    if (node == null) return null;
    JsonNode value = node.get(field);
    return value == null || value.isNull() ? null : value.asString();
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
