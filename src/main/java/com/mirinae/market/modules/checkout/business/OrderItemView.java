package com.mirinae.market.modules.checkout.business;

public record OrderItemView(
    long id,
    String productName,
    String unitType,
    int unitAmount,
    int priceWon,
    int quantity,
    boolean cancelled,
    String cancellationType,
    String cancellationReason) {}
