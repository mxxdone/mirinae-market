package com.mirinae.market.modules.auth.data;

/**
 * 서버가 제공자 userinfo에서 확인한 사용자 정보다. 브라우저가 보낸 id/email은 신뢰하지 않는다. 제공자가 주지 않은 값은 null이다.
 *
 * <p>{@code providerEmailVerified}는 제공자가 확인했다고 명시적으로 반환한 경우에만 true다. 이 값은 가입 폼의 참고 상태일 뿐 서비스의 이메일
 * 소유 확인이 아니다.
 */
public record ProviderUser(
    String provider,
    String subject,
    String displayName,
    String email,
    boolean providerEmailVerified) {

  /** 제공자 확인 상태를 알 수 없는 기존 호출은 미확인으로 취급한다. */
  public ProviderUser(String provider, String subject, String displayName, String email) {
    this(provider, subject, displayName, email, false);
  }
}
