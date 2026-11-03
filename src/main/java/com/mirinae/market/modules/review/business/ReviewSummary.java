package com.mirinae.market.modules.review.business;

import java.math.BigDecimal;

public record ReviewSummary(long storeId, BigDecimal averageRating, long reviewCount) {}
