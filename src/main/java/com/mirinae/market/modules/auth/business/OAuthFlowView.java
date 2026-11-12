package com.mirinae.market.modules.auth.business;

/** 소셜 흐름 화면 응답이다. 서버가 확인한 정보만 담는다. */
public record OAuthFlowView(
    String status,
    String provider,
    String displayName,
    String email,
    boolean linkVerified,
    String message) {}
