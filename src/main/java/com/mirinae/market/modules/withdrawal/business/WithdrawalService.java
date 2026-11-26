package com.mirinae.market.modules.withdrawal.business;

import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

/**
 * 구매자 탈퇴 오케스트레이터다. 트랜잭션 경계는 {@link WithdrawalTransaction}이 소유하고, 이 클래스는 비트랜잭션으로 남아 commit 시점 실패까지
 * 관찰한다.
 *
 * <p>제공자 연결 해제는 되돌릴 수 없으므로, 외부 해제가 성공한 뒤 로컬 commit이 실패하면 500 재시도 안내 ({@link
 * WithdrawalPartialFailureException})로 구분한다. 제공자 장애(502)·미완료 거래(409)·검증 실패(400/403)는 그대로 전달해 로컬
 * 회원·거래를 유지한다.
 */
@Service
public class WithdrawalService {
  private final WithdrawalTransaction transaction;

  public WithdrawalService(WithdrawalTransaction transaction) {
    this.transaction = transaction;
  }

  /** 트랜잭션 밖에서 호출해 commit 실패를 잡는다. 잠금 순서·검증은 트랜잭션 빈이 보존한다. */
  public void withdraw(String loginId, String password, String reauthFlowId, String sid) {
    var externalConnectionRemoved = new AtomicBoolean();
    try {
      transaction.withdraw(
          loginId, password, reauthFlowId, sid, () -> externalConnectionRemoved.set(true));
    } catch (DataAccessException | TransactionException failure) {
      if (externalConnectionRemoved.get()) throw new WithdrawalPartialFailureException(failure);
      throw failure;
    }
  }
}
