package com.mirinae.market.architecture.fixture.negative.modules.backwarddata.data;

import com.mirinae.market.architecture.fixture.negative.modules.backwarddata.business.BdService;

/** 역방향 의존(Data → Business) 위반 예시다. */
public class BdRepository {

  private final BdService service = new BdService();

  public String find() {
    return service.value();
  }
}
