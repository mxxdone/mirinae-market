package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.data.FulfillmentData;
import com.mirinae.market.modules.checkout.data.RefundRow;
import com.mirinae.market.modules.product.business.ProductNotFoundException;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefundService {
  private final FulfillmentData data;
  private final RefundTransactions transactions;
  private final AccountService accounts;
  private final Clock clock;
  private final boolean recoveryEnabled;
  private final MockRefundService provider;
  private static final org.slf4j.Logger LOG =
      org.slf4j.LoggerFactory.getLogger(RefundService.class);

  public RefundService(
      FulfillmentData data,
      RefundTransactions transactions,
      AccountService accounts,
      Clock clock,
      @Value("${mirinae.refund.recovery.enabled:true}") boolean recoveryEnabled,
      MockRefundService provider) {
    this.data = data;
    this.transactions = transactions;
    this.accounts = accounts;
    this.clock = clock;
    this.recoveryEnabled = recoveryEnabled;
    this.provider = provider;
  }

  @Transactional(readOnly = true)
  public List<RefundView> list(String actor, int page) {
    accounts.requireAdministrator(actor);
    return data.managedRefunds(FulfillmentRules.page(page)).stream()
        .map(RefundService::view)
        .toList();
  }

  @Transactional
  public boolean retry(String actor, long id) {
    accounts.requireAdministrator(actor);
    var row = data.refund(id, true).orElseThrow(ProductNotFoundException::new);
    if (!row.status().equals("NEEDS_ATTENTION")) return false;
    data.retry(id, clock.instant());
    return true;
  }

  @Scheduled(fixedDelay = 500, initialDelay = 500)
  public void recover() {
    if (recoveryEnabled) recoverDue();
  }

  public void recoverDue() {
    for (long id : data.due(clock.instant())) {
      try {
        process(id);
      } catch (org.springframework.dao.DataAccessException
          | org.springframework.transaction.TransactionException error) {
        LOG.error("환불 작업 {}의 저장 상태를 다음 복구에서 다시 확인합니다.", id, error);
      }
    }
  }

  public void process(long id) {
    var claimed = transactions.claim(id);
    if (claimed.isEmpty()) return;
    var attempt = claimed.orElseThrow();
    if (attempt.mode().equals("PERMANENT_FAILURE")) {
      transactions.finish(attempt, "모의 환불이 거절되었습니다. 관리자 확인이 필요합니다.", true);
      return;
    }
    if (attempt.mode().equals("TRANSIENT_FAILURE") && attempt.attempt() == 1) {
      transactions.finish(attempt, "모의 결제사 일시 오류입니다. 자동 재시도합니다.", false);
      return;
    }
    boolean previous;
    try {
      previous = provider.complete(id, attempt.amountWon());
    } catch (org.springframework.dao.DataAccessException
        | org.springframework.transaction.TransactionException error) {
      transactions.finish(attempt, "모의 제공자 처리 오류입니다. 기존 결과를 확인한 뒤 재시도합니다.", false);
      return;
    }
    transactions.finish(
        attempt,
        attempt.mode().equals("LOST_RESPONSE") && !previous
            ? "환불 응답을 받지 못했습니다. 기존 결과를 확인합니다."
            : null,
        false);
  }

  static RefundView view(RefundRow row) {
    return new RefundView(
        row.id(),
        row.storeOrderId(),
        Long.toString(row.amountWon()),
        row.status(),
        row.attempts(),
        row.lastError(),
        row.createdAt(),
        row.completedAt());
  }
}
