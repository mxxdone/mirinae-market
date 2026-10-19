package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.checkout.data.FulfillmentData;
import java.time.Clock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MockRefundService {
  private final FulfillmentData data;
  private final Clock clock;

  public MockRefundService(FulfillmentData data, Clock clock) {
    this.data = data;
    this.clock = clock;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public boolean complete(long id, long amount) {
    boolean previous = data.providerCompleted(id);
    data.providerComplete(id, amount, clock.instant());
    return previous;
  }
}
