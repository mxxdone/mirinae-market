package com.mirinae.market.config;

import com.mirinae.market.modules.auth.business.AuthPolicy;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 인증 정책 값을 composition root에서 조립한다. 기능 모듈은 config를 참조하지 않고 일반 값만 받는다. */
@Configuration
public class AuthPolicyConfig {
  @Bean
  public AuthPolicy authPolicy(
      @Value("${auth.public-base-url}") String publicBaseUrl,
      @Value("${auth.jwt.access-ttl:PT10M}") Duration accessTtl,
      @Value("${auth.login.idle-ttl:PT30M}") Duration idleTtl,
      @Value("${auth.login.absolute-ttl:P7D}") Duration absoluteTtl,
      @Value("${auth.oauth.state-ttl:PT10M}") Duration stateTtl,
      @Value("${auth.oauth.reauth-ttl:PT5M}") Duration reauthTtl,
      @Value("${auth.cookie.refresh-name}") String refreshCookieName,
      @Value("${auth.cookie.browser-name}") String browserCookieName,
      @Value("${auth.cookie.flow-name}") String flowCookieName,
      @Value("${auth.cookie.secure:false}") boolean cookieSecure) {
    return new AuthPolicy(
        publicBaseUrl,
        accessTtl,
        idleTtl,
        absoluteTtl,
        stateTtl,
        reauthTtl,
        refreshCookieName,
        browserCookieName,
        flowCookieName,
        cookieSecure);
  }
}
