package com.mirinae.market.modules.product.business;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

final class SaleBatchRules {
  private SaleBatchRules() {}

  static void validate(List<SaleChange> changes) {
    if (changes == null || changes.size() > 100)
      throw new IllegalArgumentException("변경 상품 목록은 필수이며 한 번에 최대 100건입니다.");
    var ids = new HashSet<Long>();
    var issues = new ArrayList<SaleIssue>();
    for (SaleChange row : changes) {
      if (row == null || row.productId() == null || row.productId() <= 0 || row.selling() == null) {
        issues.add(new SaleIssue(row == null ? null : row.productId(), "상품 ID와 판매 여부를 확인해 주세요."));
      } else if (!ids.add(row.productId())) {
        issues.add(new SaleIssue(row.productId(), "같은 상품은 한 번만 변경할 수 있습니다."));
      } else if (row.selling()) {
        try {
          ProductRules.offer(row.priceWon(), row.onlineQuantity());
        } catch (IllegalArgumentException failure) {
          issues.add(new SaleIssue(row.productId(), failure.getMessage()));
        }
      }
    }
    if (!issues.isEmpty()) throw new SaleBatchException(issues);
  }
}
