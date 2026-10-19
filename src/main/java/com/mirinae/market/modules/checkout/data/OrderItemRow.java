package com.mirinae.market.modules.checkout.data;

import java.time.Instant;

public record OrderItemRow(
    long id,
    long offerId,
    String productName,
    String unitType,
    int unitAmount,
    int priceWon,
    int quantity,
    Instant cancelledAt,
    String cancellationType,
    String cancellationReason) {}
