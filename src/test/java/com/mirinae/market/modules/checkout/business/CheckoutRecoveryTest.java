package com.mirinae.market.modules.checkout.business;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.mirinae.market.modules.checkout.data.CheckoutRow;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.UnexpectedRollbackException;

class CheckoutRecoveryTest {
  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void storageFailureDoesNotSkipTheFollowingCheckout(boolean failsBeforeFinish) {
    var transactions = mock(CheckoutTransactions.class);
    when(transactions.due())
        .thenReturn(
            List.of(
                new CheckoutRow(
                    1,
                    10,
                    "first",
                    0,
                    "SUCCESS",
                    "PENDING",
                    null,
                    null,
                    0,
                    Instant.EPOCH,
                    "CART",
                    null),
                new CheckoutRow(
                    2,
                    20,
                    "second",
                    0,
                    "SUCCESS",
                    "PENDING",
                    null,
                    null,
                    0,
                    Instant.EPOCH,
                    "CART",
                    null)));
    if (failsBeforeFinish) {
      doThrow(new DataAccessResourceFailureException("시도 횟수 저장 실패"))
          .when(transactions)
          .attempted(1);
    } else {
      when(transactions.finish(10, "first")).thenThrow(new UnexpectedRollbackException("결제 확정 롤백"));
    }

    new CheckoutService(transactions).recover();

    var order = inOrder(transactions);
    order.verify(transactions).attempted(2);
    order.verify(transactions).finish(20, "second");
  }
}
