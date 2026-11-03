package com.mirinae.market.modules.store.business;

public record ManagedStoreReportView(
    StoreReportView report,
    String buyerLoginId,
    String contactName,
    String contactPhone,
    String email,
    int unresolvedClosureCount,
    boolean needsContact) {}
