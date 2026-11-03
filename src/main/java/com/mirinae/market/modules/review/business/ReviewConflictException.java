package com.mirinae.market.modules.review.business;

public final class ReviewConflictException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public ReviewConflictException(String message) {
    super(message);
  }
}
