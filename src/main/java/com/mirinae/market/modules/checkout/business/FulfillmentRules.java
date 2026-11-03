package com.mirinae.market.modules.checkout.business;

import java.time.LocalDateTime;

final class FulfillmentRules {
  private FulfillmentRules() {}

  static boolean within(LocalDateTime now, LocalDateTime start, LocalDateTime end) {
    return !now.isBefore(start) && now.isBefore(end);
  }

  static boolean canCancel(
      LocalDateTime now,
      LocalDateTime deadline,
      LocalDateTime end,
      boolean pickedUp,
      boolean failure,
      boolean remaining,
      String kind) {
    if (pickedUp || !remaining) return false;
    return switch (kind) {
      case "GENERAL" -> now.isBefore(deadline);
      case "REMAINDER" -> failure && now.isBefore(end);
      default -> throw new IllegalArgumentException("취소 종류를 확인해 주세요.");
    };
  }

  static String status(LocalDateTime now, LocalDateTime end, boolean pickedUp, boolean remaining) {
    if (!remaining) return "CANCELLED";
    if (pickedUp) return "PICKED_UP";
    return now.isBefore(end) ? "WAITING" : "NO_SHOW";
  }

  static String reason(String value) {
    if (value == null
        || value.isBlank()
        || value.strip().length() > 500
        || value.chars().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("사유는 제어 문자 없이 1~500자로 입력해 주세요.");
    return value.strip();
  }

  static String key(String value) {
    if (value == null || !value.matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("요청 키는 영문·숫자·밑줄·하이픈 1~100자여야 합니다.");
    return value;
  }

  static int page(int value) {
    if (value < 0 || value > 100000) throw new IllegalArgumentException("페이지 범위를 확인해 주세요.");
    return value;
  }
}
