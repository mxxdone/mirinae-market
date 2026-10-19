package com.mirinae.market.modules.checkout.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class FulfillmentRulesTest {
  private static final LocalDateTime START = LocalDateTime.parse("2026-10-19T14:00:00");
  private static final LocalDateTime END = LocalDateTime.parse("2026-10-19T18:00:00");

  @Test
  void pickupUsesInclusiveStartAndExclusiveEnd() {
    assertThat(FulfillmentRules.within(START, START, END)).isTrue();
    assertThat(FulfillmentRules.within(END.minusNanos(1), START, END)).isTrue();
    assertThat(FulfillmentRules.within(START.minusNanos(1), START, END)).isFalse();
    assertThat(FulfillmentRules.within(END, START, END)).isFalse();
  }

  @Test
  void cancellationClosesAtDeadlineAndRemainderRequiresFailure() {
    assertThat(
            FulfillmentRules.canCancel(
                START.minusNanos(1), START, END, false, false, true, "GENERAL"))
        .isTrue();
    assertThat(FulfillmentRules.canCancel(START, START, END, false, false, true, "GENERAL"))
        .isFalse();
    assertThat(FulfillmentRules.canCancel(START, START, END, false, true, true, "REMAINDER"))
        .isTrue();
    assertThat(FulfillmentRules.canCancel(END, START, END, false, true, true, "REMAINDER"))
        .isFalse();
    assertThat(FulfillmentRules.canCancel(START, START, END, true, true, true, "REMAINDER"))
        .isFalse();
    assertThat(FulfillmentRules.canCancel(START, START, END, false, false, true, "REMAINDER"))
        .isFalse();
  }

  @Test
  void noShowDoesNotMeanCancellationAndEmptyOrderIsCancelled() {
    assertThat(FulfillmentRules.status(END, END, false, true)).isEqualTo("NO_SHOW");
    assertThat(FulfillmentRules.status(END, END, true, true)).isEqualTo("PICKED_UP");
    assertThat(FulfillmentRules.status(START, END, false, false)).isEqualTo("CANCELLED");
  }

  @Test
  void reasonAndKeysRejectMissingOrOversizedInput() {
    assertThat(FulfillmentRules.reason(" 확인 내용 ")).isEqualTo("확인 내용");
    assertThatThrownBy(() -> FulfillmentRules.reason(" "))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> FulfillmentRules.reason("가".repeat(501)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> FulfillmentRules.key(null))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
