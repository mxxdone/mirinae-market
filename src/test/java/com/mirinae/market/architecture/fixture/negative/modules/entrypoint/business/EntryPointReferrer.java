package com.mirinae.market.architecture.fixture.negative.modules.entrypoint.business;

import com.mirinae.market.MirinaeMarketApplication;

/** 기능 코드가 애플리케이션 진입점을 역참조하는 위반 예시다. */
public class EntryPointReferrer {

  private final MirinaeMarketApplication application = new MirinaeMarketApplication();

  public MirinaeMarketApplication application() {
    return application;
  }
}
