package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.checkout.data.FulfillmentData;
import com.mirinae.market.modules.product.business.ProductNotFoundException;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefundTransactions {
  private final FulfillmentData data;
  private final Clock clock;

  public RefundTransactions(FulfillmentData data, Clock clock) {
    this.data = data;
    this.clock = clock;
  }

  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public Optional<RefundAttempt> claim(long id) {
    var row = data.refund(id, true).orElseThrow(ProductNotFoundException::new);
    if (!row.status().equals("PENDING") || row.dueAt().isAfter(clock.instant()))
      return Optional.empty();
    if (data.providerCompleted(id)) {
      data.completed(id, clock.instant());
      return Optional.empty();
    }
    if (row.attempts() >= 4) {
      data.failed(id, "자동 재시도 횟수를 소진했습니다. 관리자 확인이 필요합니다.", true);
      return Optional.empty();
    }
    String token = UUID.randomUUID().toString();
    // 제공자 호출 전에 시도를 커밋한다. 중단된 작업은 임대 만료 후 결과부터 확인한다.
    data.claim(id, token, clock.instant().plusSeconds(30));
    return Optional.of(
        new RefundAttempt(id, row.amountWon(), row.mode(), row.attempts() + 1, token));
  }

  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public void finish(RefundAttempt attempt, String error, boolean permanent) {
    var row = data.refund(attempt.id(), true).orElseThrow(ProductNotFoundException::new);
    if (row.status().equals("COMPLETED")) return;
    if (data.providerCompleted(attempt.id()) && (error == null || attempt.attempt() >= 4)) {
      data.completed(attempt.id(), clock.instant());
      return;
    }
    if (!row.status().equals("PENDING") || !data.matchesAttempt(attempt.id(), attempt.token()))
      return;
    if (data.providerCompleted(attempt.id()) && !attempt.mode().equals("LOST_RESPONSE")) {
      data.completed(attempt.id(), clock.instant());
      return;
    }
    int delay =
        switch (attempt.attempt()) {
          case 1 -> 1;
          case 2 -> 5;
          default -> 30;
        };
    data.defer(attempt.id(), clock.instant().plusSeconds(delay));
    data.failed(
        attempt.id(),
        error == null ? "환불 결과 확인이 필요합니다." : error,
        permanent || attempt.attempt() >= 4);
  }
}
