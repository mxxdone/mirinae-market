package com.mirinae.market.modules.checkout.business;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class CheckoutService {
  private static final Logger LOG = LoggerFactory.getLogger(CheckoutService.class);
  private final CheckoutTransactions transactions;

  public CheckoutService(CheckoutTransactions transactions) {
    this.transactions = transactions;
  }

  public List<java.util.Map<String, Object>> managedOrders(String query, int page) {
    return transactions.managedOrders(query, page);
  }

  public List<java.util.Map<String, Object>> managedOrderItems(long id) {
    return transactions.managedOrderItems(id);
  }

  public CartView cart(String loginId) {
    return transactions.cart(loginId);
  }

  public void prepareBuyerWithdrawal(String loginId) {
    transactions.prepareBuyerWithdrawal(loginId);
  }

  public CartView put(String loginId, long marketId, long offerId, Integer quantity) {
    return transactions.put(loginId, marketId, offerId, quantity);
  }

  public CartView add(String loginId, long marketId, long offerId, Integer quantity) {
    return transactions.add(loginId, marketId, offerId, quantity);
  }

  public CartView remove(String loginId, long offerId) {
    return transactions.remove(loginId, offerId);
  }

  public CartView clear(String loginId) {
    return transactions.clear(loginId);
  }

  public CheckoutAttempt start(String loginId, String key, Long version, String mode) {
    return start(loginId, key, version, mode, null, null, null);
  }

  public CheckoutAttempt start(
      String loginId,
      String key,
      Long version,
      String mode,
      List<Long> offerIds,
      CheckoutItemConditions direct,
      List<CheckoutItemConditions> itemConditions) {
    var prepared =
        transactions.prepare(loginId, key, version, mode, offerIds, direct, itemConditions);
    var result = transactions.finish(transactions.buyerId(loginId), key);
    return new CheckoutAttempt(
        result, prepared.loseResponse() && result.status().equals("CONFIRMED"));
  }

  public CheckoutView result(String loginId, String key) {
    return transactions.result(loginId, key);
  }

  public List<CheckoutView> history(String loginId) {
    return transactions.history(loginId);
  }

  public StatementView statement(String loginId, long checkoutId) {
    return transactions.statement(loginId, checkoutId);
  }

  @Scheduled(fixedDelay = 500, initialDelay = 500)
  public void recover() {
    for (var row : transactions.due()) {
      try {
        transactions.attempted(row.id());
        transactions.finish(row.buyerId(), row.requestKey());
      } catch (DataAccessException | TransactionException failure) {
        LOG.error("결제 요청 {}의 저장 상태를 다음 복구에서 다시 확인합니다.", row.id(), failure);
      }
    }
  }
}
