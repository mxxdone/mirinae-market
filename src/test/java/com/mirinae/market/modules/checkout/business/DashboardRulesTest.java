package com.mirinae.market.modules.checkout.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;

class DashboardRulesTest {
  private static final Instant AS_OF = Instant.parse("2026-10-13T03:00:00Z");

  @Test
  void dateDefaultsToKoreanTodayAndAcceptsFullIsoDate() {
    assertThat(DashboardRules.date(null, AS_OF)).isEqualTo(LocalDate.of(2026, 10, 13));
    assertThat(DashboardRules.date("2026-01-31", AS_OF)).isEqualTo(LocalDate.of(2026, 1, 31));
    assertThat(DashboardRules.date("0001-01-01", AS_OF)).isEqualTo(LocalDate.of(1, 1, 1));
    assertThat(DashboardRules.date("9999-12-31", AS_OF)).isEqualTo(LocalDate.of(9999, 12, 31));
  }

  @Test
  void monthDefaultsToKoreanCurrentMonthAndAcceptsFullIsoMonth() {
    assertThat(DashboardRules.month(null, AS_OF)).isEqualTo(YearMonth.of(2026, 10));
    assertThat(DashboardRules.month("2026-02", AS_OF)).isEqualTo(YearMonth.of(2026, 2));
    assertThat(DashboardRules.month("9999-12", AS_OF)).isEqualTo(YearMonth.of(9999, 12));
  }

  @Test
  void rejectsNonStrictDateFormats() {
    for (String value :
        new String[] {
          "",
          "2026-1-01",
          "2026-10-1",
          "2026-10-13 ",
          " 2026-10-13",
          "26-10-13",
          "2026/10/13",
          "2026-13-01",
          "2026-02-30",
          "0000-01-01",
          "10000-01-01",
          "2026-10-13T00:00",
          "+2026-10-13"
        }) {
      assertThatThrownBy(() -> DashboardRules.date(value, AS_OF))
          .as(value)
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void rejectsNonStrictMonthFormats() {
    for (String value :
        new String[] {
          "",
          "2026-1",
          "2026-10-01",
          "2026-13",
          "2026-00",
          "0000-01",
          "10000-01",
          "2026/10",
          "2026-10 "
        }) {
      assertThatThrownBy(() -> DashboardRules.month(value, AS_OF))
          .as(value)
          .isInstanceOf(IllegalArgumentException.class);
    }
  }

  @Test
  void monthStartIsKoreanMidnightInclusive() {
    assertThat(DashboardRules.monthStart(YearMonth.of(2026, 10)))
        .isEqualTo(Instant.parse("2026-09-30T15:00:00Z"));
    assertThat(DashboardRules.monthStart(YearMonth.of(9999, 12)))
        .isEqualTo(Instant.parse("9999-11-30T15:00:00Z"));
    assertThat(DashboardRules.monthStart(YearMonth.of(10000, 1)).toString())
        .isEqualTo("9999-12-31T15:00:00Z");
  }
}
