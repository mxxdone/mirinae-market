package com.mirinae.market.modules.product.business;

import java.util.Objects;

final class InventoryRules {
  private InventoryRules() {}

  static void version(Long actual, Long expected) {
    if (!Objects.equals(actual, expected))
      throw new ProductConflictException(
          "INVENTORY_CONFLICT", "재고가 변경되었습니다. 작성값을 보존했습니다. 최신 수량을 조회한 뒤 다시 적용해 주세요.");
  }
}
