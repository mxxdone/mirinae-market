package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.checkout.business.RefundView;
import java.time.Instant;

public record AdminRefundView(
    long id,
    long storeOrderId,
    String amountWon,
    String status,
    int attempts,
    String lastError,
    Instant createdAt,
    Instant completedAt) {
  static AdminRefundView from(RefundView v) {
    return new AdminRefundView(
        v.id(),
        v.storeOrderId(),
        v.amountWon(),
        v.status(),
        v.attempts(),
        v.lastError(),
        v.createdAt(),
        v.completedAt());
  }
}
