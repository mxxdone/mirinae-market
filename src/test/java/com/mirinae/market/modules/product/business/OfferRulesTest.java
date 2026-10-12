package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class OfferRulesTest {
  @Test
  void todayUsesKoreanMidnightEvenWithUtcClock() {
    Clock before = Clock.fixed(Instant.parse("2026-10-12T14:59:59Z"), ZoneOffset.UTC);
    Clock midnight = Clock.fixed(Instant.parse("2026-10-12T15:00:00Z"), ZoneOffset.UTC);
    LocalDate pickup = LocalDate.parse("2026-10-12");
    assertThat(OfferRules.today(before)).isEqualTo(pickup);
    assertThat(OfferRules.today(midnight)).isEqualTo(pickup.plusDays(1));
    OfferRules.date(pickup, before);
    assertThatIllegalArgumentException().isThrownBy(() -> OfferRules.date(pickup, midnight));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.date(pickup.minusDays(1), before));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.date(pickup.plusDays(1), before));
    assertThatIllegalArgumentException().isThrownBy(() -> OfferRules.date(null, before));
  }

  @Test
  void orderDeadlineMustNotExceedPickupStartAndClosesAtExactInstant() {
    OfferRules.window(LocalTime.of(17, 0), LocalTime.of(19, 0), LocalTime.of(16, 0));
    OfferRules.window(LocalTime.of(17, 0), LocalTime.of(19, 0), LocalTime.of(17, 0));
    assertThatIllegalArgumentException()
        .isThrownBy(
            () -> OfferRules.window(LocalTime.of(17, 0), LocalTime.of(19, 0), LocalTime.of(18, 0)));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.window(LocalTime.of(17, 0), LocalTime.of(19, 0), null));
    assertThatIllegalArgumentException()
        .isThrownBy(
            () ->
                OfferRules.window(
                    LocalTime.of(17, 0), LocalTime.of(19, 0), LocalTime.of(16, 0, 1)));
    OfferRules.open(
        LocalTime.of(16, 0), Clock.fixed(Instant.parse("2026-10-13T06:59:59Z"), ZoneOffset.UTC));
    assertThatIllegalArgumentException()
        .isThrownBy(
            () ->
                OfferRules.open(
                    LocalTime.of(16, 0),
                    Clock.fixed(Instant.parse("2026-10-13T07:00:00Z"), ZoneOffset.UTC)));
  }

  @Test
  void pickupWindowStaysWithinOneDayWithMinutePrecision() {
    OfferRules.window(LocalTime.MIDNIGHT, LocalTime.of(23, 59));
    assertThatIllegalArgumentException().isThrownBy(() -> OfferRules.window(null, LocalTime.NOON));
    assertThatIllegalArgumentException().isThrownBy(() -> OfferRules.window(LocalTime.NOON, null));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.window(LocalTime.NOON, LocalTime.NOON));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.window(LocalTime.of(18, 0), LocalTime.of(14, 0)));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> OfferRules.window(LocalTime.of(14, 0, 1), LocalTime.of(18, 0)));
  }
}
