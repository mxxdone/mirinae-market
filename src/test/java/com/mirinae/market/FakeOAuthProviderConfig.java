package com.mirinae.market;

import com.mirinae.market.modules.auth.data.OAuthProviderClient;
import com.mirinae.market.modules.auth.data.ProviderUser;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * OAuth 제공자 HTTP 경계만 테스트용으로 대체한다. 실제 HTTP·PostgreSQL·Redis 흐름은 그대로 두며, 실제 제공자 키·브라우저 검증은 별도 미검증
 * 항목이다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class FakeOAuthProviderConfig {

  @Bean
  @Primary
  public FakeOAuthProvider fakeOAuthProvider() {
    return new FakeOAuthProvider();
  }

  /** 인가 코드를 제공자 사용자로 매핑하는 test-only 제공자다. production endpoint를 사용하지 않는다. */
  public static class FakeOAuthProvider implements OAuthProviderClient {
    private final ConcurrentHashMap<String, ProviderUser> codes = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Boolean> unlinked = new ConcurrentHashMap<>();
    private final java.util.Set<String> failingUnlink =
        java.util.concurrent.ConcurrentHashMap.newKeySet();

    public String issueCode(String provider, String subject, String displayName, String email) {
      String code = "code-" + java.util.UUID.randomUUID();
      codes.put(code, new ProviderUser(provider, subject, displayName, email));
      return code;
    }

    public int unlinkCount(String subject) {
      return unlinked.containsKey(subject) ? 1 : 0;
    }

    public void failNextUnlink(String subject) {
      failingUnlink.add(subject);
    }

    @Override
    public List<String> configuredProviders() {
      return List.of("kakao", "google");
    }

    @Override
    public boolean available(String provider) {
      return provider.equals("kakao") || provider.equals("google");
    }

    @Override
    public String authorizationUrl(
        String provider, String purpose, String state, String challenge, String redirectUri) {
      return "https://provider.invalid/" + provider + "?state=" + state + "&purpose=" + purpose;
    }

    @Override
    public ProviderUser exchange(
        String provider, String code, String codeVerifier, String redirectUri) {
      ProviderUser user = codes.remove(code);
      if (user == null || !user.provider().equals(provider)) {
        throw new com.mirinae.market.modules.auth.data.OAuthProviderUnavailableException(
            "테스트 제공자 코드가 올바르지 않습니다.");
      }
      return user;
    }

    @Override
    public void unlink(String provider, String subject) {
      if (failingUnlink.remove(subject)) {
        throw new com.mirinae.market.modules.auth.data.OAuthProviderUnavailableException(
            "테스트 제공자 연결 해제 실패");
      }
      if (provider.equals("kakao")) unlinked.put(subject, true);
    }
  }
}
