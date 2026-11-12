package com.mirinae.market.architecture.fixture.negative.modules.sdkleak.business;

import org.springframework.data.redis.core.StringRedisTemplate;

/** Data 밖에서 Redis SDK를 참조하는 위반 예시다. */
public class RedisSdkLeak {

  private StringRedisTemplate redis;

  public StringRedisTemplate redis() {
    return redis;
  }
}
