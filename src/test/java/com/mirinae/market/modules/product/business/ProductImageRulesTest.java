package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class ProductImageRulesTest {
  @Test
  void acceptsTinyImagesAndExactUpperLimits() {
    ProductImageRules.validate(1, 1, 100);
    ProductImageRules.validate(5000, 5000, 5 * 1024 * 1024);
    assertThat(ProductImageRules.scaled(100, 50, 768)).containsExactly(100, 50);
    assertThat(ProductImageRules.scaled(1600, 800, 256)).containsExactly(256, 128);
  }

  @Test
  void rejectsInvalidAndExcessiveInput() {
    for (int[] value :
        new int[][] {{0, 1, 1}, {1, 1, 0}, {1, 1, 5242881}, {5001, 5000, 10}, {10001, 1, 10}}) {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> ProductImageRules.validate(value[0], value[1], value[2]));
    }
  }
}
