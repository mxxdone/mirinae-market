package com.mirinae.market.modules.withdrawal.business;

import com.mirinae.market.modules.account.business.AccountAuthentication;
import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.auth.business.AuthException;
import com.mirinae.market.modules.auth.business.OAuthService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 구매자 탈퇴의 단일 트랜잭션 경계다. 거래 guard·계정 잠금·본인 확인 → 제공자 연결 해제 → 로컬 비활성화를 같은 잠금 아래 수행한다.
 *
 * <p>{@link WithdrawalService}가 프록시로 호출하므로 commit 시점 실패도 호출자에게 예외로 전달된다. 트랜잭션 메서드 내부 try/catch는
 * commit 실패를 볼 수 없으므로, commit 예외 처리는 비트랜잭션 orchestrator가 맡는다(self-invocation 금지).
 */
@Service
public class WithdrawalTransaction {

  private final CheckoutService checkout;
  private final AccountService accounts;
  private final OAuthService oauth;
  private final Clock clock;

  public WithdrawalTransaction(
      CheckoutService checkout, AccountService accounts, OAuthService oauth, Clock clock) {
    this.checkout = checkout;
    this.accounts = accounts;
    this.oauth = oauth;
    this.clock = clock;
  }

  /** 잠금 순서를 지켜 탈퇴를 확정한다. 외부 연결 해제는 로컬 변경 전에 확인한다. */
  @Transactional(isolation = Isolation.READ_COMMITTED)
  public void withdraw(String loginId, String password, String reauthFlowId, String sid) {
    // 미완료 거래 guard와 구매자 장바구니 잠금을 먼저 수행한다.
    checkout.prepareBuyerWithdrawal(loginId);
    // 계정 잠금·활성·역할·로컬 비밀번호를 검증하며 어떤 상태도 아직 바꾸지 않는다.
    long accountId = accounts.verifyBuyerWithdrawal(loginId, password);
    AccountAuthentication account =
        accounts.accountForAuthentication(accountId).orElseThrow(AuthException::unauthenticated);
    if (!account.hasLocalPassword()) {
      // 소셜 전용 계정은 현재 로그인·인증 버전·사용자에 묶인 5분 재인증 확인이 필요하다.
      if (sid == null || sid.isBlank()) throw AuthException.unauthenticated();
      oauth.consumeWithdrawalProof(reauthFlowId, accountId, sid, account.authVersion());
    }
    // 카카오 연결 해제는 로컬 변경 전에 확인한다. 실패하면 예외로 전체 롤백한다.
    oauth.unlinkIdentities(accountId);
    accounts.deactivateBuyer(accountId, clock.instant());
  }
}
