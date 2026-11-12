package com.mirinae.market.modules.account.business;

/** 계정에 연결된 소셜 신원이다. 제공자 연결 해제에 필요한 최소 정보다. */
public record LinkedIdentity(String provider, String subject) {}
