package com.mirinae.market.modules.account.data;

public record MemberRow(
    long id,
    String loginId,
    String displayName,
    String role,
    String email,
    String contactName,
    String contactPhone,
    boolean passwordChangeRequired) {}
