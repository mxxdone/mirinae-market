package com.mirinae.market.modules.checkout.business;

import java.util.HashSet;
import java.util.List;

final class CheckoutRules {
  private CheckoutRules() {}

  static int quantity(Integer value) {
    if (value == null || value < 1) throw new IllegalArgumentException("구매 수량은 양의 정수여야 합니다.");
    return value;
  }

  static int addedQuantity(int existing, Integer added) {
    int count = quantity(added);
    try {
      return Math.addExact(existing, count);
    } catch (ArithmeticException failure) {
      throw new IllegalArgumentException("장바구니 수량이 지원 범위를 초과합니다.", failure);
    }
  }

  static String fingerprint(List<Long> ids, DirectPurchaseItem direct) {
    if (direct != null) {
      if (ids != null) throw new IllegalArgumentException("선택 결제와 바로 구매를 함께 요청할 수 없습니다.");
      if (direct.offerId() == null
          || direct.offerId() < 1
          || direct.expectedPrice() == null
          || direct.expectedPrice() < 1
          || direct.startTime() == null
          || direct.endTime() == null
          || direct.orderDeadline() == null
          || !direct.startTime().isBefore(direct.endTime())
          || direct.orderDeadline().isAfter(direct.startTime()))
        throw new IllegalArgumentException("바로 구매 상품과 가격·수령 조건을 확인해 주세요.");
      quantity(direct.quantity());
      return "DIRECT:"
          + direct.offerId()
          + ":"
          + direct.quantity()
          + ":"
          + direct.expectedPrice()
          + ":"
          + direct.startTime()
          + ":"
          + direct.endTime()
          + ":"
          + direct.orderDeadline();
    }
    if (ids == null) return "ALL";
    items(ids);
    if (ids.stream().anyMatch(id -> id == null || id < 1))
      throw new IllegalArgumentException("결제할 상품 번호를 확인해 주세요.");
    return ids.stream()
        .sorted()
        .map(String::valueOf)
        .collect(java.util.stream.Collectors.joining(","));
  }

  static String key(String value) {
    if (value == null || !value.matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("결제 요청 키는 영문·숫자·밑줄·하이픈 1~100자입니다.");
    return value;
  }

  static String mode(String value) {
    if (value == null || !List.of("SUCCESS", "FAIL", "DELAY", "LOST_RESPONSE").contains(value))
      throw new IllegalArgumentException("모의 결제 유형을 확인해 주세요.");
    return value;
  }

  static void items(List<Long> ids) {
    if (ids.isEmpty() || ids.size() > 100 || new HashSet<>(ids).size() != ids.size())
      throw new IllegalArgumentException("장바구니는 중복 없이 1~100개 상품이어야 합니다.");
  }

  static long amount(List<Integer> prices, List<Integer> quantities) {
    try {
      long total = 0;
      for (int i = 0; i < prices.size(); i++)
        total = Math.addExact(total, Math.multiplyExact((long) prices.get(i), quantities.get(i)));
      return total;
    } catch (ArithmeticException failure) {
      throw new IllegalArgumentException("결제 총액이 지원 범위를 초과합니다.", failure);
    }
  }
}
