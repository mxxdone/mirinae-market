package com.mirinae.market.modules.checkout.data;

import java.time.Instant;

public record CheckoutRow(
    long id,
    long buyerId,
    String requestKey,
    long cartVersion,
    String mode,
    String status,
    String errorCode,
    String message,
    long totalWon,
    Instant dueAt) {}
