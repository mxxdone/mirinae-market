package com.mirinae.market.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * 통합 테스트는 실제 Redis 컨테이너를 사용한다. Docker 실패 시 skip하지 않는다.
 *
 * <p>Redis는 공유 singleton holder에서 처음 필요할 때 한 번만 기동하고, 컨텍스트 빈 바인딩 전에 등록되는 {@link
 * DynamicPropertyRegistrar}로 host/port를 주입한다. 정적 초기화의 {@code System.setProperty}는 @Import 클래스의 ASM
 * 분석만으로는 실행되지 않아 바인딩보다 늦거나 전역 상태를 오염시킬 수 있으므로 사용하지 않는다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class RedisTestConfig {

  @Bean
  DynamicPropertyRegistrar redisConnectionProperties() {
    return registry -> {
      registry.add("spring.data.redis.host", () -> RedisHolder.host());
      registry.add("spring.data.redis.port", () -> Integer.toString(RedisHolder.port()));
    };
  }

  /** 재기동 테스트가 같은 Redis에 연결하도록 주소를 전달한다. */
  public static String host() {
    return RedisHolder.host();
  }

  public static int port() {
    return RedisHolder.port();
  }

  /** 컨테이너는 테스트 JVM에서 한 번만 기동하고 공유한다. 클래스 초기화가 지연·단일 실행을 보장한다. */
  private static final class RedisHolder {
    private static final GenericContainer<?> REDIS =
        new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379)
            .withCommand(
                "redis-server",
                "--save",
                "",
                "--appendonly",
                "no",
                "--maxmemory",
                "128mb",
                "--maxmemory-policy",
                "noeviction")
            .withStartupAttempts(3);

    static {
      REDIS.start();
    }

    private RedisHolder() {}

    static String host() {
      return REDIS.getHost();
    }

    static int port() {
      return REDIS.getMappedPort(6379);
    }
  }
}
