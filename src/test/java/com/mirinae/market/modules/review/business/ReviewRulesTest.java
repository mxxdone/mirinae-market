package com.mirinae.market.modules.review.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ReviewRulesTest {
  @Test
  void creationWindowStartsAtPickupAndEndsBeforeThirtyDays() {
    var pickup = Instant.parse("2026-11-01T15:00:00Z");
    var deadline = pickup.plus(Duration.ofDays(30));
    assertThat(ReviewRules.canCreate(pickup, pickup.minusNanos(1))).isFalse();
    assertThat(ReviewRules.canCreate(pickup, pickup)).isTrue();
    assertThat(ReviewRules.canCreate(pickup, deadline.minusNanos(1))).isTrue();
    assertThat(ReviewRules.canCreate(pickup, deadline)).isFalse();
    assertThat(ReviewRules.canCreate(pickup, deadline.plusSeconds(1))).isFalse();
  }

  @Test
  void validatesWholeStarsAndRequiredUnicodeTextWithoutRejectingNewlines() {
    assertThat(ReviewRules.rating(1)).isEqualTo(1);
    assertThat(ReviewRules.rating(5)).isEqualTo(5);
    for (Integer value : new Integer[] {null, 0, 6}) {
      assertThatThrownBy(() -> ReviewRules.rating(value))
          .isInstanceOf(IllegalArgumentException.class);
    }
    assertThat(ReviewRules.text("  구매 후기\n좋아요  ")).isEqualTo("구매 후기\n좋아요");
    assertThat(ReviewRules.text("가".repeat(1000))).hasSize(1000);
    assertThatThrownBy(() -> ReviewRules.text("가".repeat(1001)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> ReviewRules.text(" \n ")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> ReviewRules.text("후기\0")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void administratorDeletionCannotBeEditedOrRestoredByAuthor() {
    ReviewRules.requireEditable(false, false);
    assertThatThrownBy(() -> ReviewRules.requireEditable(true, false))
        .isInstanceOf(ReviewConflictException.class);
    assertThatThrownBy(() -> ReviewRules.requireEditable(false, true))
        .isInstanceOf(ReviewConflictException.class);
    assertThatThrownBy(() -> ReviewRules.requireEditable(true, true))
        .isInstanceOf(ReviewConflictException.class);
    ReviewRules.requireAuthorRestore(false);
    assertThatThrownBy(() -> ReviewRules.requireAuthorRestore(true))
        .isInstanceOf(ReviewConflictException.class);
  }
}
