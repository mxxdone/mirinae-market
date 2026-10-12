package com.mirinae.market.modules.product.business;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

final class OfferRules {
  private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

  private OfferRules() {}

  static LocalDate tomorrow(Clock clock) {
    return LocalDate.now(clock.withZone(SERVICE_ZONE)).plusDays(1);
  }

  static void date(LocalDate date, Clock clock) {
    if (date == null || !date.equals(tomorrow(clock))) {
      throw new IllegalArgumentException("한국 시간 기준 내일 수령분만 등록·수정할 수 있습니다.");
    }
  }

  static void window(LocalTime start, LocalTime end) {
    if (start == null
        || end == null
        || !start.isBefore(end)
        || start.getSecond() != 0
        || end.getSecond() != 0
        || start.getNano() != 0
        || end.getNano() != 0) {
      throw new IllegalArgumentException("수령 시간은 같은 날의 분 단위이며 시작이 마감보다 빨라야 합니다.");
    }
  }
}
