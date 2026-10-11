package com.mirinae.market.modules.account.data;

public record AccountRow(
    long id, String loginId, String passwordHash, String displayName, String email, String role) {}
