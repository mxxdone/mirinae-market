package com.mirinae.market.modules.product.business;

import java.util.List;

public record SaleProductPage(
    List<SaleProductView> items, int page, int size, boolean hasNext, long totalItems) {}
