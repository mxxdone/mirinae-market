package com.mirinae.market.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {
  @Bean
  public Clock serviceClock() {
    return Clock.systemUTC();
  }
}
