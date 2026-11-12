package com.mirinae.market.modules.withdrawal.business;

/**
 * 제공자 연결 해제는 끝났지만 로컬 저장에 실패한 경우다. 외부 변경은 되돌릴 수 없으므로 로컬 회원·연결은 유지되고, 사용자는 재시도해야 한다. 제공자 장애(502)와
 * 구분되는 서버 오류다.
 */
public class WithdrawalPartialFailureException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public WithdrawalPartialFailureException(Throwable cause) {
    super("탈퇴를 마무리하지 못했습니다. 잠시 후 다시 시도해 주세요. 다시 시도해도 되지 않으면 고객센터에 문의해 주세요.", cause);
  }
}
