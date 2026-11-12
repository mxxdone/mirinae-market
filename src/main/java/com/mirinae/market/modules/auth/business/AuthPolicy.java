package com.mirinae.market.modules.auth.business;

import java.time.Duration;

/**
 * 인증 기능의 정책 값이다. 외부 설정 이름·시크릿은 Data가 소유하고, Business는 일반 값만 받는다.
 *
 * @param publicBaseUrl 브라우저가 접근하는 동일 출처 기준 주소
 * @param accessTtl access JWT 수명
 * @param idleTtl 유휴 인증 상태 수명
 * @param absoluteTtl 최초 발급부터의 최대 인증 수명
 * @param stateTtl OAuth state·미완료 흐름 수명
 * @param reauthTtl 탈퇴 소셜 재인증 확인 수명
 * @param refreshCookieName refresh HttpOnly 쿠키 이름
 * @param browserCookieName OAuth 브라우저 바인딩 쿠키 이름
 * @param flowCookieName OAuth 흐름 쿠키 이름
 * @param cookieSecure HTTPS 환경의 쿠키 Secure 여부
 */
public record AuthPolicy(
    String publicBaseUrl,
    Duration accessTtl,
    Duration idleTtl,
    Duration absoluteTtl,
    Duration stateTtl,
    Duration reauthTtl,
    String refreshCookieName,
    String browserCookieName,
    String flowCookieName,
    boolean cookieSecure) {}
