package com.mirinae.market.architecture.fixture.positive.modules.featurea.business;

import com.mirinae.market.architecture.fixture.positive.modules.featurea.data.FeatureARepository;
import com.mirinae.market.architecture.fixture.positive.modules.featureb.business.FeatureBEntry;
import org.springframework.stereotype.Service;

@Service
public class FeatureAService {

  private final FeatureARepository repository = new FeatureARepository();
  private final FeatureBEntry featureBEntry = new FeatureBEntry();

  public String create() {
    return repository.find() + featureBEntry.value();
  }
}
