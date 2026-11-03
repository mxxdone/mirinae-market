package com.mirinae.market.modules.admin.business;

import java.time.Instant;
import java.util.List;

public record AdminReviewRequestPage(
    List<Item> items, int page, int size, boolean hasNext, long totalItems) {
  public record Item(
      long id,
      long reviewId,
      long storeId,
      String storeName,
      int rating,
      String content,
      String reason,
      String status,
      String decisionReason,
      Instant createdAt) {}
}
