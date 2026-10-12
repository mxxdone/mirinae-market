package com.mirinae.market.modules.product.business;

import java.math.BigDecimal;
import java.math.RoundingMode;

final class ProductRules {
  private ProductRules() {}

  static String name(String value) {
    if (value == null || value.codePoints().anyMatch(Character::isISOControl)) {
      throw new IllegalArgumentException("상품명은 제어 문자 없이 1~100자로 입력해 주세요.");
    }
    String normalized = value.strip();
    if (normalized.isEmpty() || normalized.codePointCount(0, normalized.length()) > 100) {
      throw new IllegalArgumentException("상품명은 1~100자로 입력해 주세요.");
    }
    return normalized;
  }

  static String description(String value) {
    String normalized = value == null ? "" : value.strip();
    if (normalized.codePointCount(0, normalized.length()) > 1000 || normalized.indexOf('\0') >= 0) {
      throw new IllegalArgumentException("상품 설명은 최대 1,000자로 입력해 주세요.");
    }
    return normalized;
  }

  static SaleUnit unit(String type, Integer amount) {
    if (type == null || amount == null || !(type.equals("WEIGHT") || type.equals("COUNT"))) {
      throw new IllegalArgumentException("WEIGHT(g) 또는 COUNT(개)와 판매 구성 숫자를 입력해 주세요.");
    }
    return new SaleUnit(SaleUnit.Kind.valueOf(type), amount);
  }

  static BigDecimal comparisonPrice(int priceWon, SaleUnit unit) {
    int referenceAmount = unit.kind() == SaleUnit.Kind.WEIGHT ? 100 : 1;
    return BigDecimal.valueOf(priceWon)
        .multiply(BigDecimal.valueOf(referenceAmount))
        .divide(BigDecimal.valueOf(unit.amount()), 2, RoundingMode.HALF_UP);
  }

  static void offer(Integer priceWon, Integer quantity) {
    if (priceWon == null || priceWon <= 0 || quantity == null || quantity < 0) {
      throw new IllegalArgumentException("가격은 양의 정수 원화, 온라인 수량은 0 이상의 정수여야 합니다.");
    }
  }

  static String query(String value) {
    String normalized = value == null ? "" : value.strip();
    if (normalized.codePointCount(0, normalized.length()) > 100 || normalized.indexOf('\0') >= 0) {
      throw new IllegalArgumentException("검색어는 최대 100자로 입력해 주세요.");
    }
    return normalized;
  }

  static void page(int page, int size) {
    if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("페이지는 0 이상, 크기는 1~100이며 조회 범위는 정수 범위 이내여야 합니다.");
    }
  }
}
