package com.mirinae.market.modules.store.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class StoreReportRulesTest {
  @Test
  void reportsCanAdvanceOrResolveButNeverReopen() {
    assertThat(StoreReportRules.transition("OPEN", "REVIEWING")).isTrue();
    assertThat(StoreReportRules.transition("OPEN", "RESOLVED")).isTrue();
    assertThat(StoreReportRules.transition("REVIEWING", "RESOLVED")).isTrue();
    assertThat(StoreReportRules.transition("RESOLVED", "OPEN")).isFalse();
    assertThat(StoreReportRules.transition("REVIEWING", "OPEN")).isFalse();
  }

  @Test
  void reportTypeAndDescriptionAreValidated() {
    assertThat(StoreReportRules.type("CLOSURE_SUSPECTED")).isEqualTo("CLOSURE_SUSPECTED");
    assertThatThrownBy(() -> StoreReportRules.type("OTHER"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> StoreReportRules.text(" "))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
