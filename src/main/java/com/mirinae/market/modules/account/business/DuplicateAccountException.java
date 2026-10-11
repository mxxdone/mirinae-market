package com.mirinae.market.modules.account.business;

public final class DuplicateAccountException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  DuplicateAccountException(Throwable cause) {
    super("이미 사용 중인 ID 또는 이메일입니다.", cause);
  }
}
