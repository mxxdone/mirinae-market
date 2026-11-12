package com.mirinae.market.modules.auth.data;

/** 서버가 제공자 userinfo에서 확인한 사용자 정보다. 브라우저가 보낸 id/email은 신뢰하지 않는다. 제공자가 주지 않은 값은 null이다. */
public record ProviderUser(String provider, String subject, String displayName, String email) {}
