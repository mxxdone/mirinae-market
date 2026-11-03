package com.mirinae.market.modules.product.business;

public final class ProductImageForbiddenException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public ProductImageForbiddenException() {
    super("본인 매장에서 업로드한 사진만 연결할 수 있습니다.");
  }
}
