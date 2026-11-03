package com.mirinae.market.modules.account.business;

public record MemberView(
    long id,
    String loginId,
    String displayName,
    String role,
    String email,
    String contactName,
    String contactPhone,
    boolean passwordChangeRequired) {}
