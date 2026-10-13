package com.mirinae.market.modules.checkout.business;

public class CheckoutConflictException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final String code;

  public CheckoutConflictException(String code, String message) {
    super(message);
    this.code = code;
  }

  public String code() {
    return code;
  }
}
