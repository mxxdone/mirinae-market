package com.mirinae.market.architecture.fixture.negative.modules.backwardbusiness.business;

import com.mirinae.market.architecture.fixture.negative.modules.backwardbusiness.presentation.BbController;

/** 역방향 의존(Business → Presentation) 위반 예시다. */
public class BbService {

  private final BbController controller = new BbController();

  public String value() {
    return controller.handle();
  }
}
