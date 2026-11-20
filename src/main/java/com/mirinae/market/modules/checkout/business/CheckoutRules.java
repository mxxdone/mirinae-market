package com.mirinae.market.modules.checkout.business;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

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

  static String fingerprint(
      List<Long> ids, CheckoutItemConditions direct, List<CheckoutItemConditions> itemConditions) {
    if (direct != null) {
      if (ids != null || itemConditions != null)
        throw new IllegalArgumentException("선택 결제와 바로 구매를 함께 요청할 수 없습니다.");
      return "DIRECT:" + checkedConditions(direct, ":");
    }
    if (itemConditions != null) {
      if (ids == null || itemConditions.size() != ids.size() || ids.isEmpty() || ids.size() > 100)
        throw new IllegalArgumentException("선택한 모든 상품의 결제 조건을 보내 주세요.");
      items(ids);
      var conditionIds =
          itemConditions.stream().map(CheckoutRules::checkedOfferId).collect(Collectors.toSet());
      if (!conditionIds.equals(new HashSet<>(ids)))
        throw new IllegalArgumentException("결제 조건이 선택 상품과 일치하지 않습니다.");
      String canonical =
          itemConditions.stream()
              .sorted(Comparator.comparing(CheckoutItemConditions::offerId))
              .map(item -> checkedConditions(item, "|"))
              .collect(Collectors.joining(","));
      try {
        byte[] digest =
            MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
        return "CART:" + HexFormat.of().formatHex(digest);
      } catch (NoSuchAlgorithmException failure) {
        throw new IllegalStateException("결제 요청 비교값을 만들 수 없습니다.", failure);
      }
    }
    if (ids == null) return "ALL";
    items(ids);
    if (ids.stream().anyMatch(id -> id == null || id < 1))
      throw new IllegalArgumentException("결제할 상품 번호를 확인해 주세요.");
    return ids.stream().sorted().map(String::valueOf).collect(Collectors.joining(","));
  }

  private static Long checkedOfferId(CheckoutItemConditions item) {
    if (item == null || item.offerId() == null || item.offerId() < 1)
      throw new IllegalArgumentException("결제할 상품 번호를 확인해 주세요.");
    return item.offerId();
  }

  private static String checkedConditions(CheckoutItemConditions item, String separator) {
    long offerId = checkedOfferId(item);
    if (item.expectedPrice() == null
        || item.expectedPrice() < 1
        || item.startTime() == null
        || item.endTime() == null
        || item.orderDeadline() == null
        || !item.startTime().isBefore(item.endTime())
        || item.orderDeadline().isAfter(item.startTime()))
      throw new IllegalArgumentException("상품 가격과 수령 조건을 확인해 주세요.");
    return String.join(
        separator,
        Long.toString(offerId),
        Integer.toString(quantity(item.quantity())),
        item.expectedPrice().toString(),
        item.startTime().toString(),
        item.endTime().toString(),
        item.orderDeadline().toString());
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
