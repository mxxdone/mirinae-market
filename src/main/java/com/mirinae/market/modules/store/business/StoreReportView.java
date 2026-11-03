package com.mirinae.market.modules.store.business;

import java.time.Instant;

public record StoreReportView(
    long id,
    long storeId,
    String storeName,
    String type,
    String description,
    String status,
    String resolution,
    Instant createdAt,
    Instant updatedAt) {}
