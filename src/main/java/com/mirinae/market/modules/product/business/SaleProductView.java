package com.mirinae.market.modules.product.business;

public record SaleProductView(
    ProductView product,
    boolean selling,
    Integer priceWon,
    Integer onlineQuantity,
    Long inventoryVersion) {}
