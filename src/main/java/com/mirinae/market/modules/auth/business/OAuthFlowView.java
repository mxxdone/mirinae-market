package com.mirinae.market.modules.auth.business;

/**
 * 소셜 흐름 화면 응답이다. 서버가 확인한 정보만 담는다. {@code providerEmailVerified}는 제공자 확인 상태의 참고값이며 서비스의 이메일 소유 확인이
 * 아니고 SIGNUP 흐름에서만 true일 수 있다.
 */
public record OAuthFlowView(
    String status,
    String provider,
    String displayName,
    String email,
    boolean providerEmailVerified,
    boolean linkVerified,
    String message) {}
