package com.mirinae.market.modules.checkout.business;

public record OrderItemView(
    String productName, String unitType, int unitAmount, int priceWon, int quantity) {}
