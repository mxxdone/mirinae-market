package com.mirinae.market.modules.checkout.business;

import java.util.List;

public record StoreOrderPage(List<StoreOrderView> items, int page, boolean hasNext) {}
