package com.mirinae.market.modules.checkout.business;

import java.time.Instant;

public record RefundView(
    long id,
    long storeOrderId,
    String amountWon,
    String status,
    int attempts,
    String lastError,
    Instant createdAt,
    Instant completedAt) {}
