package com.mirinae.market.modules.store.business;

import java.util.Set;

final class StoreReportRules {
  private StoreReportRules() {}

  static String type(String value) {
    if (!Set.of("CLOSURE_SUSPECTED", "INACTIVE", "LOCATION_ERROR")
        .contains(value == null ? "" : value))
      throw new IllegalArgumentException("제보 종류를 확인해 주세요.");
    return value;
  }

  static String text(String value) {
    if (value == null
        || value.isBlank()
        || value.strip().length() > 500
        || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("내용은 제어 문자 없이 1~500자로 입력해 주세요.");
    return value.strip();
  }

  static boolean transition(String before, String after) {
    return (before.equals("OPEN")
            && Set.of("REVIEWING", "RESOLVED").contains(after == null ? "" : after))
        || (before.equals("REVIEWING") && "RESOLVED".equals(after));
  }

  static int page(int page) {
    if (page < 0 || page > 100000) throw new IllegalArgumentException("페이지 범위를 확인해 주세요.");
    return page;
  }
}
