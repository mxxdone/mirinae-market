package com.mirinae.market.modules.auth.business;

/** 현재 사용자 응답이다. 공유 AccountView와 달리 인증된 본인에게만 로그인 수단을 노출한다. */
public record AuthMe(
    long id,
    String loginId,
    String displayName,
    String role,
    boolean requiresPasswordChange,
    boolean hasLocalPassword,
    java.util.List<String> linkedProviders) {}
