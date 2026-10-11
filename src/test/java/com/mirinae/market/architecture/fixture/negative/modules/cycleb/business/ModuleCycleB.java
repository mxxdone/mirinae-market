package com.mirinae.market.architecture.fixture.negative.modules.cycleb.business;

import com.mirinae.market.architecture.fixture.negative.modules.cyclea.business.ModuleCycleA;

public class ModuleCycleB {

  public ModuleCycleA makeA() {
    return new ModuleCycleA();
  }
}
