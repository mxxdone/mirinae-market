package com.mirinae.market.architecture.fixture.negative.modules.classcycle.business;

public class CycleB {

  public CycleA makeA() {
    return new CycleA();
  }
}
