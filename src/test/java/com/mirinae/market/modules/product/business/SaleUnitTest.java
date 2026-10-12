package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SaleUnitTest {
  @ParameterizedTest
  @ValueSource(ints = {100, 500, 1000, 2147483600})
  void acceptsWeightInPositiveHundredGramMultiples(int grams) {
    SaleUnit unit = new SaleUnit(SaleUnit.Kind.WEIGHT, grams);
    assertThat(unit.kind()).isEqualTo(SaleUnit.Kind.WEIGHT);
    assertThat(unit.amount()).isEqualTo(grams);
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 12, Integer.MAX_VALUE})
  void acceptsPositiveItemCount(int count) {
    SaleUnit unit = new SaleUnit(SaleUnit.Kind.COUNT, count);
    assertThat(unit.kind()).isEqualTo(SaleUnit.Kind.COUNT);
    assertThat(unit.amount()).isEqualTo(count);
  }

  @ParameterizedTest
  @ValueSource(ints = {Integer.MIN_VALUE, -100, 0, 1, 99, 101, 550, Integer.MAX_VALUE})
  void rejectsInvalidWeight(int grams) {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new SaleUnit(SaleUnit.Kind.WEIGHT, grams));
  }

  @ParameterizedTest
  @ValueSource(ints = {Integer.MIN_VALUE, -1, 0})
  void rejectsNonPositiveItemCount(int count) {
    assertThatIllegalArgumentException().isThrownBy(() -> new SaleUnit(SaleUnit.Kind.COUNT, count));
  }

  @Test
  void requiresSaleUnitKind() {
    assertThatIllegalArgumentException().isThrownBy(() -> new SaleUnit(null, 100));
  }
}
