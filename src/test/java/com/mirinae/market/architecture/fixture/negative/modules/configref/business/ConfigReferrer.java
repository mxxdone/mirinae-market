package com.mirinae.market.architecture.fixture.negative.modules.configref.business;

import com.mirinae.market.config.OpenApiConfig;

/** 기능 모듈이 composition root의 config를 역참조하는 위반 예시다. */
public class ConfigReferrer {

  private final OpenApiConfig config = new OpenApiConfig();

  public OpenApiConfig config() {
    return config;
  }
}
