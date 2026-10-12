package com.mirinae.market.modules.product.data;

public record ProductRow(
    long id, long storeId, String name, String description, String unitType, int unitAmount) {}
