package com.mirinae.market.modules.product.business;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

final class OfferRules {
  private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

  private OfferRules() {}

  static LocalDate today(Clock clock) {
    return LocalDate.now(clock.withZone(SERVICE_ZONE));
  }

  static void date(LocalDate date, Clock clock) {
    if (date == null || !date.equals(today(clock))) {
      throw new IllegalArgumentException("한국 시간 기준 오늘 수령분만 등록·수정할 수 있습니다.");
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

  static void window(LocalTime start, LocalTime end, LocalTime deadline) {
    window(start, end);
    if (deadline == null
        || deadline.isAfter(start)
        || deadline.getSecond() != 0
        || deadline.getNano() != 0) {
      throw new IllegalArgumentException("주문 마감은 분 단위이며 수령 시작보다 늦을 수 없습니다.");
    }
  }

  static LocalTime now(Clock clock) {
    return LocalTime.now(clock.withZone(SERVICE_ZONE));
  }

  static void open(LocalTime deadline, Clock clock) {
    if (!now(clock).isBefore(deadline)) {
      throw new IllegalArgumentException("주문 마감 시각이 지났습니다. 판매 조건을 등록·변경할 수 없습니다.");
    }
  }
}
