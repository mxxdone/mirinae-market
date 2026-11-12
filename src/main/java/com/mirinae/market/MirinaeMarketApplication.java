package com.mirinae.market;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

/**
 * 미리내 마켓 백엔드 애플리케이션 진입점이다.
 *
 * <p>인증은 자체 JWT(Bearer + Redis 로그인 상태)로 처리하므로 Spring Boot의 기본 in-memory {@code UserDetailsService}
 * 자동 구성은 사용하지 않는다. 이를 명시적으로 제외해 기동 시 생성되는 기본 사용자와 {@code Using generated security password} 로그(평문
 * 비밀번호 노출·기본 관리자 오해)를 없앤다. 로그인·인가 경로는 기존 SecurityFilterChain과 동일하게 유지된다.
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class MirinaeMarketApplication {

  /** 애플리케이션을 기동한다. */
  public static void main(String[] args) {
    SpringApplication.run(MirinaeMarketApplication.class, args);
  }
}
