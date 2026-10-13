package com.mirinae.market.config;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
public class ClockConfig {
  @Bean
  @Profile("!e2e")
  public Clock serviceClock() {
    return Clock.systemUTC();
  }

  /** E2E 실행 시 시간만 고정하며 실제 HTTP·DB·인증 흐름은 유지한다. */
  @Bean
  @Profile("e2e")
  public Clock e2eClock(@Value("${e2e.fixed-instant}") String instant) {
    return Clock.fixed(Instant.parse(instant), ZoneOffset.UTC);
  }
}
