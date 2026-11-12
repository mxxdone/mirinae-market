package com.mirinae.market.architecture.fixture.negative.modules.sdkleak.business;

import com.nimbusds.jose.jwk.JWKSet;

/** Data 밖에서 Nimbus JOSE 구현을 참조하는 위반 예시다. */
public class NimbusSdkLeak {

  private JWKSet keys;

  public JWKSet keys() {
    return keys;
  }
}
