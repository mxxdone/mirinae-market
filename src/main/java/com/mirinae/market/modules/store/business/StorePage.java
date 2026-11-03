package com.mirinae.market.modules.store.business;

import java.util.List;

public record StorePage(
    List<StoreView> items, int page, int size, boolean hasNext, long totalItems) {}
