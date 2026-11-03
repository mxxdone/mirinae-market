package com.mirinae.market.modules.checkout.data;

import java.time.Instant;

public record RefundRow(
    long id,
    long storeOrderId,
    long amountWon,
    String status,
    String mode,
    int attempts,
    String lastError,
    Instant dueAt,
    Instant createdAt,
    Instant completedAt) {}
