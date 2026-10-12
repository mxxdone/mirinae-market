package com.mirinae.market.modules.product.business;

import java.util.List;

public record OfferPage(List<OfferView> items, int page, int size, boolean hasNext) {}
