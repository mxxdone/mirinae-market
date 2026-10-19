package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.store.business.ManagedStoreReportView;

public record AdminManagedReportView(
    AdminReportView report,
    String buyerLoginId,
    String contactName,
    String contactPhone,
    String email,
    int unresolvedClosureCount,
    boolean needsContact) {
  static AdminManagedReportView from(ManagedStoreReportView v) {
    return new AdminManagedReportView(
        AdminReportView.from(v.report()),
        v.buyerLoginId(),
        v.contactName(),
        v.contactPhone(),
        v.email(),
        v.unresolvedClosureCount(),
        v.needsContact());
  }
}
