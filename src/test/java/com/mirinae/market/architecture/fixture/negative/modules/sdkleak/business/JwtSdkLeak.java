package com.mirinae.market.architecture.fixture.negative.modules.sdkleak.business;

import org.springframework.security.oauth2.jwt.JwtEncoder;

/** Data 밖에서 JOSE/JWT SDK를 참조하는 위반 예시다. */
public class JwtSdkLeak {

  private JwtEncoder encoder;

  public JwtEncoder encoder() {
    return encoder;
  }
}
