package com.mirinae.market.modules.withdrawal.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WithdrawalService {
  private final CheckoutService checkout;
  private final AccountService accounts;
  private final Clock clock;

  public WithdrawalService(CheckoutService checkout, AccountService accounts, Clock clock) {
    this.checkout = checkout;
    this.accounts = accounts;
    this.clock = clock;
  }

  @Transactional(isolation = Isolation.READ_COMMITTED)
  public void withdraw(String loginId, String password) {
    checkout.prepareBuyerWithdrawal(loginId);
    accounts.withdrawBuyer(loginId, password, clock.instant());
  }
}
