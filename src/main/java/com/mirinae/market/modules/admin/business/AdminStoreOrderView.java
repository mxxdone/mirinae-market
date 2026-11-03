package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.checkout.business.StoreOrderView;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AdminStoreOrderView(
    long id,
    long storeId,
    String storeName,
    LocalDate pickupDate,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline,
    List<AdminOrderItemView> items,
    String status,
    String pickupCode,
    boolean hasFulfillmentFailure,
    boolean canCancel,
    boolean canCancelRemaining,
    String cancelledWon,
    String refundedWon,
    List<AdminRefundView> refunds) {
  static AdminStoreOrderView from(StoreOrderView v) {
    return new AdminStoreOrderView(
        v.id(),
        v.storeId(),
        v.storeName(),
        v.pickupDate(),
        v.startTime(),
        v.endTime(),
        v.orderDeadline(),
        v.items().stream().map(AdminOrderItemView::from).toList(),
        v.status(),
        null,
        v.hasFulfillmentFailure(),
        v.canCancel(),
        v.canCancelRemaining(),
        v.cancelledWon(),
        v.refundedWon(),
        v.refunds().stream().map(AdminRefundView::from).toList());
  }
}
