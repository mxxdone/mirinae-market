package com.mirinae.market.modules.store.data;

import java.time.Instant;

public record StoreReportRow(
    long id,
    long storeId,
    String storeName,
    long buyerId,
    String type,
    String description,
    String status,
    String resolution,
    Instant createdAt,
    Instant updatedAt,
    String buyerLoginId,
    String contactName,
    String contactPhone,
    String email,
    int unresolvedClosureCount) {}
