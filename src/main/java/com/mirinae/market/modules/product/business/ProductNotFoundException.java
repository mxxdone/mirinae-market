package com.mirinae.market.modules.product.business;

public class ProductNotFoundException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public ProductNotFoundException() {
    super("상품 또는 공개된 판매 조건을 찾을 수 없습니다.");
  }
}
