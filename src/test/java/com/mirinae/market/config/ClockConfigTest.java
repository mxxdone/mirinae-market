package com.mirinae.market.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ClockConfigTest {
  private final ApplicationContextRunner runner =
      new ApplicationContextRunner().withUserConfiguration(ClockConfig.class);

  @Test
  void fixedClockIsRestrictedToE2eProfile() {
    String instant = "2026-10-13T03:00:00Z";
    runner
        .withPropertyValues("spring.profiles.active=e2e", "e2e.fixed-instant=" + instant)
        .run(
            context -> {
              assertThat(context).hasSingleBean(Clock.class);
              assertThat(context.getBean(Clock.class).instant()).isEqualTo(Instant.parse(instant));
            });
    runner
        .withPropertyValues("e2e.fixed-instant=" + instant)
        .run(
            context -> {
              assertThat(context).hasSingleBean(Clock.class);
              assertThat(context).hasBean("serviceClock");
              assertThat(context).doesNotHaveBean("e2eClock");
            });
  }

  @Test
  void e2eWithoutFixedInstantFailsInsteadOfUsingRealTime() {
    runner
        .withPropertyValues("spring.profiles.active=e2e")
        .run(context -> assertThat(context).hasFailed());
  }
}
