package com.mirinae.market.architecture.fixture.positive.modules.featurea.presentation;

import com.mirinae.market.architecture.fixture.positive.modules.featurea.business.FeatureAService;

public class FeatureAController {

  private final FeatureAService service = new FeatureAService();

  public String handle() {
    return service.create();
  }
}
