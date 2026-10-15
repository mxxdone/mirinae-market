package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class InventoryRulesTest {
  @Test
  void initialOfferNeedsNoVersionAndExistingOfferNeedsMatchingVersion() {
    InventoryRules.version(null, null);
    InventoryRules.version(0L, 0L);
    InventoryRules.version(10L, 10L);
  }

  @Test
  void staleMissingAndInventedVersionsAreRejected() {
    assertThatThrownBy(() -> InventoryRules.version(1L, 0L))
        .isInstanceOf(ProductConflictException.class);
    assertThatThrownBy(() -> InventoryRules.version(0L, null))
        .isInstanceOf(ProductConflictException.class);
    assertThatThrownBy(() -> InventoryRules.version(null, 0L))
        .isInstanceOf(ProductConflictException.class);
  }
}
