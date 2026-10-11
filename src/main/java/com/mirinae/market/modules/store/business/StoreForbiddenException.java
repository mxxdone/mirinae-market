package com.mirinae.market.modules.store.business;

public final class StoreForbiddenException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  StoreForbiddenException() {
    super("본인 매장만 조회할 수 있습니다.");
  }
}
