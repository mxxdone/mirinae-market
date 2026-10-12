package com.mirinae.market.modules.product.business;

public class ProductConflictException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final String code;

  public ProductConflictException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String code() {
    return code;
  }
}
