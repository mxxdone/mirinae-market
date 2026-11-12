package com.mirinae.market.modules.auth.data;

/**
 * OAuth 제공자 연동 경계다. Business는 이 일반 값 계약만 사용하고 실제 HTTP·SDK는 구현체에 격리한다. 테스트는 같은 경계를 test-only 구현으로
 * 대체해 실제 HTTP 흐름만 검증한다.
 */
public interface OAuthProviderClient {

  /** 실제 설정이 완전한 제공자만 반환한다. 카카오는 admin key까지 있어야 활성으로 본다. */
  java.util.List<String> configuredProviders();

  boolean available(String provider);

  /** 고정 endpoint 기준 authorize URL을 만든다. purpose가 link·withdraw면 제공자 재인증을 강제한다. */
  String authorizationUrl(
      String provider, String purpose, String state, String codeChallenge, String redirectUri);

  /** 서버에서 인가 코드를 교환하고 userinfo로 사용자를 확인한다. */
  ProviderUser exchange(String provider, String code, String codeVerifier, String redirectUri);

  /** 제공자 연결을 해제한다. 이미 해제된 카카오 사용자(-101)는 멱등 성공으로 본다. */
  void unlink(String provider, String subject);
}
