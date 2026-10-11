package com.mirinae.market.architecture.fixture.negative.modules.crossdatacaller.business;

import com.mirinae.market.architecture.fixture.negative.modules.crossdatatarget.data.CrossDataTarget;

/** 다른 기능의 Data 타입을 참조하는 위반 예시다. */
public class CrossDataCaller {

  private final CrossDataTarget target = new CrossDataTarget();

  public String call() {
    return target.find();
  }
}
