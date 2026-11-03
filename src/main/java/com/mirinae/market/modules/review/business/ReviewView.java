package com.mirinae.market.modules.review.business;

import java.time.Instant;

public record ReviewView(
    long id,
    long storeId,
    int rating,
    String content,
    Instant createdAt,
    Instant updatedAt,
    Reply reply) {
  public record Reply(String content, Instant updatedAt) {}
}
