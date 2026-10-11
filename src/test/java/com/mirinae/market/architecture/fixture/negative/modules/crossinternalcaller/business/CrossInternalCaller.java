package com.mirinae.market.architecture.fixture.negative.modules.crossinternalcaller.business;

import com.mirinae.market.architecture.fixture.negative.modules.crossinternaltarget.business.internal.CrossInternalTarget;

/** 다른 기능의 비공개 Business 타입(business 하위 패키지)을 참조하는 위반 예시다. */
public class CrossInternalCaller {

  private final CrossInternalTarget target = new CrossInternalTarget();

  public String call() {
    return target.help();
  }
}
