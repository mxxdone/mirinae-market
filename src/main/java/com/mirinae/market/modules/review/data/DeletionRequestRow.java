package com.mirinae.market.modules.review.data;

import java.time.Instant;

public record DeletionRequestRow(
    long id,
    long reviewId,
    long storeId,
    String storeName,
    int rating,
    String content,
    String reason,
    String status,
    String decisionReason,
    Instant createdAt) {}
