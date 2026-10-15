package com.mirinae.market.modules.checkout.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class CheckoutRulesTest {
  @Test
  void quantitiesMustBePositiveIntegers() {
    assertThat(CheckoutRules.quantity(1)).isEqualTo(1);
    assertThat(CheckoutRules.quantity(Integer.MAX_VALUE)).isEqualTo(Integer.MAX_VALUE);
    for (Integer value : new Integer[] {null, 0, -1}) {
      assertThatThrownBy(() -> CheckoutRules.quantity(value))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void amountUsesLongArithmetic() {
    assertThat(CheckoutRules.amount(List.of(Integer.MAX_VALUE, Integer.MAX_VALUE), List.of(2, 2)))
        .isEqualTo(8589934588L);
  }

  @Test
  void requestKeyIsBoundedAndNotNormalized() {
    assertThat(CheckoutRules.key("checkout-123")).isEqualTo("checkout-123");
    for (String value : new String[] {null, "", "bad key", "x".repeat(101)}) {
      assertThatThrownBy(() -> CheckoutRules.key(value))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void cartSizeAndDuplicateOffersAreRejected() {
    CheckoutRules.items(List.of(1L, 2L));
    for (List<Long> ids :
        List.of(
            List.<Long>of(),
            List.of(1L, 1L),
            java.util.stream.LongStream.range(1, 102).boxed().toList())) {
      assertThatThrownBy(() -> CheckoutRules.items(ids))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void paymentModesAreExplicit() {
    for (String mode : List.of("SUCCESS", "FAIL", "DELAY", "LOST_RESPONSE")) {
      assertThat(CheckoutRules.mode(mode)).isEqualTo(mode);
    }
    assertThatThrownBy(() -> CheckoutRules.mode("unknown"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void amountOverflowIsRejectedBeforeStockChanges() {
    var huge = java.util.Collections.nCopies(3, Integer.MAX_VALUE);
    assertThatThrownBy(() -> CheckoutRules.amount(huge, huge))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
