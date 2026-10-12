package com.mirinae.market.modules.product.business;

public record ProductView(
    long id,
    long storeId,
    String name,
    String description,
    String unitType,
    int unitAmount,
    boolean hasSales) {}
