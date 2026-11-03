package com.mirinae.market.modules.review.business;

import java.time.Instant;

public record DeletionRequestView(
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
