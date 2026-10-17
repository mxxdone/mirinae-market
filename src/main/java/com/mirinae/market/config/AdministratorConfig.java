package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.AccountService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class AdministratorConfig {
  @Bean
  public ApplicationRunner administratorBootstrap(
      AccountService accounts, Environment environment) {
    return arguments -> {
      if (environment.getProperty("admin.bootstrap.enabled", Boolean.class, false)) {
        accounts.bootstrapAdministrator(
            environment.getRequiredProperty("admin.bootstrap.login-id"),
            environment.getRequiredProperty("admin.bootstrap.password"),
            environment.getRequiredProperty("admin.bootstrap.email"));
      }
    };
  }
}
