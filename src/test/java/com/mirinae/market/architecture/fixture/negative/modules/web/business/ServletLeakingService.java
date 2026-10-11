package com.mirinae.market.architecture.fixture.negative.modules.web.business;

import org.springframework.web.bind.annotation.RestController;

/** Business에서 HTTP 타입을 참조하는 위반 예시다. */
@RestController
public class ServletLeakingService {

  public String handle() {
    return "x";
  }
}
