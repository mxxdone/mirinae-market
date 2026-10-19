package com.mirinae.market.modules.store.business;

public final class StoreNotFoundException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public StoreNotFoundException() {
    super("매장 또는 제보를 찾을 수 없습니다.");
  }
}
