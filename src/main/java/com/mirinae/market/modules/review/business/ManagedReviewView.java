package com.mirinae.market.modules.review.business;

public record ManagedReviewView(
    ReviewView review,
    long storeOrderId,
    String storeName,
    boolean authorDeleted,
    boolean adminDeleted,
    String adminReason) {}
