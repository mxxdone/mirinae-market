package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.product.business.OfferView;

public record CartItemView(
    OfferView offer, int quantity, int expectedPrice, boolean available, boolean changed) {}
