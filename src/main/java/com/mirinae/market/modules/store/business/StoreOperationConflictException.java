package com.mirinae.market.modules.store.business;

public final class StoreOperationConflictException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public StoreOperationConflictException() {
    super("허용되지 않은 제보 상태 변경입니다.");
  }
}
