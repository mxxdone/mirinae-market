package com.mirinae.market.modules.account.business;

/**
 * 계정 저장소(DB) 장애로 인증·인가 판단을 할 수 없을 때 던진다. ADR-015대로 503 fail-closed이며 자격 증명 불일치(401)와 구분한다. DB
 * 원인·SQL은 클라이언트에 노출하지 않는다.
 */
public class AccountUnavailableException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public AccountUnavailableException(Throwable cause) {
    super("계정 저장소를 일시적으로 사용할 수 없습니다.", cause);
  }
}
