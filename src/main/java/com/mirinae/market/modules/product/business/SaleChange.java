package com.mirinae.market.modules.product.business;

public record SaleChange(
    Long productId, Boolean selling, Integer priceWon, Integer onlineQuantity) {}
