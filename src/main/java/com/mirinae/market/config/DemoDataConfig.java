package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import com.mirinae.market.modules.store.business.StoreService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("demo")
public class DemoDataConfig {
  @Bean
  public ApplicationRunner demoData(AccountService accounts, StoreService stores) {
    return arguments -> {
      accounts.ensureDemoAccount("demo_buyer", "Demo1234!", "데모구매자", "buyer@example.com", "BUYER");
      AccountView sellerA =
          accounts.ensureDemoAccount(
              "demo_seller_a", "Demo1234!", "데모판매자A", "seller-a@example.com", "SELLER");
      AccountView sellerB =
          accounts.ensureDemoAccount(
              "demo_seller_b", "Demo1234!", "데모판매자B", "seller-b@example.com", "SELLER");
      stores.ensureDemoStore(sellerA.loginId(), "미리내시장", "미리내청과");
      stores.ensureDemoStore(sellerB.loginId(), "은하시장", "은하수산");
    };
  }
}
