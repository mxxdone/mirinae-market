package com.mirinae.market.architecture.fixture.negative.modules.cyclea.business;

import com.mirinae.market.architecture.fixture.negative.modules.cycleb.business.ModuleCycleB;

/** 모듈 순환(cyclea ↔ cycleb) 위반 예시다. */
public class ModuleCycleA {

  public ModuleCycleB makeB() {
    return new ModuleCycleB();
  }
}
