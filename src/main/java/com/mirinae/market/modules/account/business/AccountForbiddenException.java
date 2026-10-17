package com.mirinae.market.modules.account.business;

public class AccountForbiddenException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public AccountForbiddenException() {
    super("요청 권한이 없습니다.");
  }
}
