package com.mirinae.market.modules.review.business;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;

final class ReviewRules {
  private ReviewRules() {}

  static Instant deadline(Instant pickup) {
    return pickup.plus(Duration.ofDays(30));
  }

  static boolean canCreate(Instant pickup, Instant now) {
    return !now.isBefore(pickup) && now.isBefore(deadline(pickup));
  }

  static int rating(Number value) {
    if (value == null) throw new IllegalArgumentException("별점은 정수 1~5점이어야 합니다.");
    try {
      int rating = new BigDecimal(value.toString()).intValueExact();
      if (rating < 1 || rating > 5) throw new ArithmeticException();
      return rating;
    } catch (ArithmeticException | NumberFormatException exception) {
      throw new IllegalArgumentException("별점은 정수 1~5점이어야 합니다.", exception);
    }
  }

  static String text(String value) {
    return text(value, 1000);
  }

  static String reason(String value) {
    return text(value, 500);
  }

  private static String text(String value, int maximum) {
    String text = value == null ? "" : value.strip();
    if (text.isEmpty()
        || text.codePointCount(0, text.length()) > maximum
        || text.chars()
            .anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t')) {
      throw new IllegalArgumentException("내용은 제어 문자 없이 1~" + maximum + "자로 입력해 주세요.");
    }
    return text;
  }

  static void page(int page, int size) {
    if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("페이지·조회 크기 범위를 확인해 주세요.");
    }
  }

  static void requireEditable(boolean authorDeleted, boolean adminDeleted) {
    if (authorDeleted || adminDeleted)
      throw new ReviewConflictException("삭제된 리뷰는 수정할 수 없습니다. 복구 상태를 확인해 주세요.");
  }

  static void requireAuthorRestore(boolean adminDeleted) {
    if (adminDeleted) throw new ReviewConflictException("관리자가 삭제한 리뷰는 관리자가 해제해야 합니다.");
  }
}
