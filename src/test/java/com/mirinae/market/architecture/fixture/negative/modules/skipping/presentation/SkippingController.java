package com.mirinae.market.architecture.fixture.negative.modules.skipping.presentation;

import com.mirinae.market.architecture.fixture.negative.modules.skipping.data.SkippingRepository;

/** 계층 건너뛰기(Presentation → Data) 위반 예시다. */
public class SkippingController {

  private final SkippingRepository repository = new SkippingRepository();

  public String handle() {
    return repository.find();
  }
}
