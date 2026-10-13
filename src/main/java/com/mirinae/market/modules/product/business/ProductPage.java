package com.mirinae.market.modules.product.business;

import java.util.List;

public record ProductPage(
    List<ProductView> items, int page, int size, boolean hasNext, long totalItems) {}
