package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.store.business.StoreReportView;
import java.time.Instant;

public record AdminReportView(
    long id,
    long storeId,
    String storeName,
    String type,
    String description,
    String status,
    String resolution,
    Instant createdAt,
    Instant updatedAt) {
  static AdminReportView from(StoreReportView v) {
    return new AdminReportView(
        v.id(),
        v.storeId(),
        v.storeName(),
        v.type(),
        v.description(),
        v.status(),
        v.resolution(),
        v.createdAt(),
        v.updatedAt());
  }
}
