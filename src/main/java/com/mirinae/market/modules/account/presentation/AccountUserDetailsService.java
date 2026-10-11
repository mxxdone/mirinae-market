package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountCredentials;
import com.mirinae.market.modules.account.business.AccountService;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Component;

@Component
public class AccountUserDetailsService implements UserDetailsService {
  private final AccountService accounts;

  public AccountUserDetailsService(AccountService accounts) {
    this.accounts = accounts;
  }

  @Override
  public UserDetails loadUserByUsername(String username) {
    AccountCredentials credentials =
        accounts
            .credentials(username)
            .orElseThrow(() -> new UsernameNotFoundException("인증 정보가 올바르지 않습니다."));
    return User.withUsername(credentials.loginId())
        .password(credentials.passwordHash())
        .roles(credentials.role())
        .build();
  }
}
