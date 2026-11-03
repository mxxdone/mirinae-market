package com.mirinae.market.modules.review.data;

import java.time.Instant;

public record ReviewRow(
    long id,
    long storeOrderId,
    long storeId,
    String storeName,
    int rating,
    String content,
    Instant createdAt,
    Instant updatedAt,
    Instant authorDeletedAt,
    Instant adminDeletedAt,
    String adminReason,
    String replyContent,
    Instant replyUpdatedAt,
    boolean deletionRequested) {}
