package com.mirinae.market.modules.checkout.business;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 판매자 대시보드의 날짜·월 입력과 한국 시간 월 경계를 검증·계산한다. */
final class DashboardRules {
  private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
  private static final Pattern DATE = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})");
  private static final Pattern MONTH = Pattern.compile("(\\d{4})-(\\d{2})");
  private static final String INVALID = "조회 날짜는 YYYY-MM-DD, 월은 YYYY-MM 형식이어야 합니다.";

  private DashboardRules() {}

  static LocalDate date(String value, Instant asOf) {
    if (value == null) return LocalDate.ofInstant(asOf, ZONE);
    Matcher matcher = DATE.matcher(value);
    if (!matcher.matches()) throw new IllegalArgumentException(INVALID);
    try {
      int year = year(matcher.group(1));
      return LocalDate.of(
          year, Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(3)));
    } catch (DateTimeException failure) {
      throw new IllegalArgumentException(INVALID, failure);
    }
  }

  static YearMonth month(String value, Instant asOf) {
    if (value == null) return YearMonth.from(LocalDate.ofInstant(asOf, ZONE));
    Matcher matcher = MONTH.matcher(value);
    if (!matcher.matches()) throw new IllegalArgumentException(INVALID);
    try {
      return YearMonth.of(year(matcher.group(1)), Integer.parseInt(matcher.group(2)));
    } catch (DateTimeException failure) {
      throw new IllegalArgumentException(INVALID, failure);
    }
  }

  /** 선택 월의 한국 시간 1일 0시에 해당하는 순간이다. */
  static Instant monthStart(YearMonth month) {
    return month.atDay(1).atStartOfDay(ZONE).toInstant();
  }

  /** 다음 달 한국 시간 1일 0시(선택 월 미포함)에 해당하는 순간이다. 9999-12도 안전하다. */
  static Instant monthEnd(YearMonth month) {
    return month.plusMonths(1).atDay(1).atStartOfDay(ZONE).toInstant();
  }

  private static int year(String value) {
    int year = Integer.parseInt(value);
    if (year < 1 || year > 9999) throw new DateTimeException("지원 연도 범위를 벗어났습니다.");
    return year;
  }
}
