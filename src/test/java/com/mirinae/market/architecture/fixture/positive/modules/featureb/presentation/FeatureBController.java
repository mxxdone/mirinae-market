package com.mirinae.market.architecture.fixture.positive.modules.featureb.presentation;

import com.mirinae.market.architecture.fixture.positive.modules.featureb.business.FeatureBEntry;

public class FeatureBController {

  private final FeatureBEntry entry = new FeatureBEntry();

  public String handle() {
    return entry.value();
  }
}
