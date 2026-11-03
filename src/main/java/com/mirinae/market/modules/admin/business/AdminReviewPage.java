package com.mirinae.market.modules.admin.business;

import java.time.Instant;
import java.util.List;

public record AdminReviewPage(
    List<Item> items, int page, int size, boolean hasNext, long totalItems) {
  public record Item(
      long id,
      long storeId,
      long storeOrderId,
      String storeName,
      int rating,
      String content,
      Instant createdAt,
      boolean authorDeleted,
      boolean adminDeleted,
      String adminReason) {}
}
