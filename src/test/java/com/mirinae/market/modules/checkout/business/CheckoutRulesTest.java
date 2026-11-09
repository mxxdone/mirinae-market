package com.mirinae.market.modules.checkout.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class CheckoutRulesTest {
  @Test
  void selectionFingerprintIsCanonicalAndExplicitEmptyIsNotAll() {
    assertThat(CheckoutRules.fingerprint(null, null)).isEqualTo("ALL");
    assertThat(CheckoutRules.fingerprint(List.of(2L, 1L), null)).isEqualTo("1,2");
    for (List<Long> ids :
        List.of(List.<Long>of(), List.of(1L, 1L), List.of(0L), java.util.Arrays.asList(1L, null)))
      assertThatThrownBy(() -> CheckoutRules.fingerprint(ids, null))
          .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void directFingerprintIncludesQuantityPriceAndTimesAndRejectsMixedInput() {
    var item =
        new DirectPurchaseItem(
            1L,
            2,
            1000,
            java.time.LocalTime.of(14, 0),
            java.time.LocalTime.of(18, 0),
            java.time.LocalTime.of(13, 0));
    assertThat(CheckoutRules.fingerprint(null, item))
        .isEqualTo("DIRECT:1:2:1000:14:00:18:00:13:00");
    assertThatThrownBy(() -> CheckoutRules.fingerprint(List.of(1L), item))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                CheckoutRules.fingerprint(
                    null,
                    new DirectPurchaseItem(
                        1L, 0, 1000, item.startTime(), item.endTime(), item.orderDeadline())))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void atomicAdditionRejectsInvalidQuantityAndOverflow() {
    assertThat(CheckoutRules.addedQuantity(2, 3)).isEqualTo(5);
    assertThatThrownBy(() -> CheckoutRules.addedQuantity(Integer.MAX_VALUE, 1))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> CheckoutRules.addedQuantity(1, 0))
        .isInstanceOf(IllegalArgumentException.class);
  }

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
