package com.mirinae.market.modules.account.business;

public class AccountInactiveException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public AccountInactiveException() {
    super("로그인할 수 없는 계정입니다. 다시 로그인해 주세요.");
  }
}
