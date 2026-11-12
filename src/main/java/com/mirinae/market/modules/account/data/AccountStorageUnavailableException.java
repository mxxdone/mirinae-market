package com.mirinae.market.modules.account.data;

/** 계정 저장소 조회·변경이 DB 장애로 실패했을 때 던진다. Business가 503으로 변환한다. */
public class AccountStorageUnavailableException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public AccountStorageUnavailableException(Throwable cause) {
    super("계정 저장소를 사용할 수 없습니다.", cause);
  }
}
