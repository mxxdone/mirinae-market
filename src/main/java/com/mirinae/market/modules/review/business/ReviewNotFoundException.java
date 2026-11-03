package com.mirinae.market.modules.review.business;

public final class ReviewNotFoundException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public ReviewNotFoundException() {
    super("리뷰 또는 삭제 요청을 찾을 수 없습니다.");
  }
}
