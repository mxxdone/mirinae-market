package com.mirinae.market.modules.review.data;

import java.math.BigDecimal;

public record ReviewSummaryRow(long storeId, BigDecimal averageRating, long reviewCount) {}
