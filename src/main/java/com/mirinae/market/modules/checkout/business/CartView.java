package com.mirinae.market.modules.checkout.business;

import java.util.List;

public record CartView(long version, List<CartItemView> items) {}
