package com.mirinae.market.architecture.fixture.positive.modules.featureb.business;

import com.mirinae.market.architecture.fixture.positive.modules.featureb.data.FeatureBRepository;
import org.springframework.stereotype.Service;

/** business 패키지 바로 아래 public 타입으로, 다른 기능에 허용되는 공개 진입점이다. */
@Service
public class FeatureBEntry {

  private final FeatureBRepository repository = new FeatureBRepository();

  public String value() {
    return repository.load();
  }
}
