package com.mirinae.market.modules.withdrawal.business;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.mirinae.market.modules.account.business.AccountAuthentication;
import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.auth.business.OAuthService;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;

class WithdrawalServiceTest {
  @Test
  void databaseFailureBeforeKakaoUnlinkKeepsOriginalError() {
    var accounts = mock(AccountService.class);
    var checkout = mock(CheckoutService.class);
    var oauth = mock(OAuthService.class);
    var transaction = new WithdrawalTransaction(checkout, accounts, oauth, Clock.systemUTC());
    var service = new WithdrawalService(transaction);
    var failure = new DataAccessResourceFailureException("거래 확인 실패");
    doThrow(failure).when(checkout).prepareBuyerWithdrawal("buyer");

    assertThatThrownBy(() -> service.withdraw("buyer", "password", null, null)).isSameAs(failure);
    verifyNoInteractions(oauth);
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void localWriteFailureIsPartialOnlyAfterConfirmedExternalUnlink(boolean unlinked) {
    var accounts = mock(AccountService.class);
    var checkout = mock(CheckoutService.class);
    var oauth = mock(OAuthService.class);
    var clock = Clock.fixed(Instant.EPOCH, ZoneOffset.UTC);
    var transaction = new WithdrawalTransaction(checkout, accounts, oauth, clock);
    var service = new WithdrawalService(transaction);
    when(accounts.verifyBuyerWithdrawal("buyer", "password")).thenReturn(1L);
    when(accounts.accountForAuthentication(1))
        .thenReturn(Optional.of(new AccountAuthentication(1, "buyer", "BUYER", "hash", true, 0)));
    when(oauth.unlinkIdentities(1)).thenReturn(unlinked);
    var failure = new DataAccessResourceFailureException("계정 비활성화 실패");
    doThrow(failure).when(accounts).deactivateBuyer(1, clock.instant());

    var error = assertThatThrownBy(() -> service.withdraw("buyer", "password", null, null));
    if (unlinked) {
      error.isInstanceOf(WithdrawalPartialFailureException.class).hasCause(failure);
    } else {
      error.isSameAs(failure);
    }
  }
}
