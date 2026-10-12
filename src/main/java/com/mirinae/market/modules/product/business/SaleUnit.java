package com.mirinae.market.modules.product.business;

record SaleUnit(Kind kind, int amount) {
  SaleUnit {
    if (kind == null) {
      throw new IllegalArgumentException("판매 단위의 중량 또는 개수 방식을 지정해 주세요.");
    }
    if (amount <= 0) {
      throw new IllegalArgumentException("판매 단위의 중량 또는 개수는 양의 정수여야 합니다.");
    }
    if (kind == Kind.WEIGHT && amount % 100 != 0) {
      throw new IllegalArgumentException("판매 단위 중량은 100g의 양의 정수 배수여야 합니다.");
    }
  }

  enum Kind {
    WEIGHT,
    COUNT
  }
}
