package com.mirinae.market.modules.admin.business;

public record AdminMemberView(
    long id,
    String loginId,
    String displayName,
    String role,
    String email,
    String contactName,
    String contactPhone) {}
