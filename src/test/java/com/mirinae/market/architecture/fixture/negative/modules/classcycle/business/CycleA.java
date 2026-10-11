package com.mirinae.market.architecture.fixture.negative.modules.classcycle.business;

/** 같은 계층 안 클래스 순환(CycleA ↔ CycleB) 위반 예시다. */
public class CycleA {

  public CycleB makeB() {
    return new CycleB();
  }
}
