package com.mirinae.market.modules.review.business;

import java.util.List;

public record ReviewPage<T>(
    List<T> items, int page, int size, boolean hasNext, long totalItems, ReviewSummary summary) {}
