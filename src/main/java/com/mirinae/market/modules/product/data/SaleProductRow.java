package com.mirinae.market.modules.product.data;

public record SaleProductRow(
    ProductRow product, boolean selling, Integer priceWon, Integer onlineQuantity) {}
