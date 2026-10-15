package com.mirinae.market.modules.checkout.business;

import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class CheckoutService {
  private final CheckoutTransactions transactions;

  public CheckoutService(CheckoutTransactions transactions) {
    this.transactions = transactions;
  }

  public CartView cart(String loginId) {
    return transactions.cart(loginId);
  }

  public CartView put(String loginId, long marketId, long offerId, Integer quantity) {
    return transactions.put(loginId, marketId, offerId, quantity);
  }

  public CartView remove(String loginId, long offerId) {
    return transactions.remove(loginId, offerId);
  }

  public CartView clear(String loginId) {
    return transactions.clear(loginId);
  }

  public CheckoutAttempt start(String loginId, String key, Long version, String mode) {
    var prepared = transactions.prepare(loginId, key, version, mode);
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

  @Scheduled(fixedDelay = 500, initialDelay = 500)
  public void recover() {
    for (var row : transactions.due()) {
      transactions.attempted(row.id());
      transactions.finish(row.buyerId(), row.requestKey());
    }
  }
}
