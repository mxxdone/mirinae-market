package com.mirinae.market.modules.review.business;

import java.time.Instant;

public record ReviewEditorView(
    long storeOrderId,
    long storeId,
    Instant creationDeadline,
    boolean canCreate,
    OwnedReview review) {
  public record OwnedReview(ReviewView review, boolean authorDeleted, boolean adminDeleted) {}
}
