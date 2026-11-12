package com.mirinae.market.modules.withdrawal.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.auth.business.OAuthService;
import org.springframework.stereotype.Service;

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
  private final AccountService accounts;
  private final OAuthService oauth;

  public WithdrawalService(
      WithdrawalTransaction transaction, AccountService accounts, OAuthService oauth) {
    this.transaction = transaction;
    this.accounts = accounts;
    this.oauth = oauth;
  }

  /** 트랜잭션 밖에서 호출해 commit 실패를 잡는다. 잠금 순서·검증은 트랜잭션 빈이 보존한다. */
  public void withdraw(String loginId, String password, String reauthFlowId, String sid) {
    boolean externalConnectionRemoved =
        accounts.linkedIdentities(accounts.current(loginId).id()).stream()
            .anyMatch(identity -> "kakao".equals(identity.provider()));
    try {
      transaction.withdraw(loginId, password, reauthFlowId, sid);
    } catch (org.springframework.dao.DataAccessException failure) {
      // JpaSystemException을 포함한 모든 DB 접근 실패가 이 상위 타입으로 잡힌다.
      throw partialIfExternal(externalConnectionRemoved, failure);
    } catch (org.springframework.transaction.TransactionException failure) {
      throw partialIfExternal(externalConnectionRemoved, failure);
    }
  }

  /** 외부 연결 해제가 이미 성공했으면 부분 실패로 변환하고, 아니면 원래 저장 실패를 그대로 전달한다. */
  private static RuntimeException partialIfExternal(
      boolean externalConnectionRemoved, RuntimeException failure) {
    if (externalConnectionRemoved) {
      return new WithdrawalPartialFailureException(failure);
    }
    return failure;
  }
}
