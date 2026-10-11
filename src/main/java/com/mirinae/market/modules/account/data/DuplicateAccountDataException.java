package com.mirinae.market.modules.account.data;

public final class DuplicateAccountDataException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  DuplicateAccountDataException(Throwable cause) {
    super("계정 ID 또는 이메일 중복", cause);
  }
}
