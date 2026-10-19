package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.checkout.business.OrderItemView;

public record AdminOrderItemView(
    long id,
    String productName,
    String unitType,
    int unitAmount,
    int priceWon,
    int quantity,
    boolean cancelled,
    String cancellationType,
    String cancellationReason) {
  static AdminOrderItemView from(OrderItemView v) {
    return new AdminOrderItemView(
        v.id(),
        v.productName(),
        v.unitType(),
        v.unitAmount(),
        v.priceWon(),
        v.quantity(),
        v.cancelled(),
        v.cancellationType(),
        v.cancellationReason());
  }
}
