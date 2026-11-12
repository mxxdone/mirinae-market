package com.mirinae.market.modules.account.business;

/** 다른 기능이 사용자 화면·인가 판단에 쓰는 최소 계정 정보다. 이메일·연락처는 포함하지 않는다. */
public record AccountSummary(
    long id, String loginId, String displayName, String role, boolean requiresPasswordChange) {}
