package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.store.business.MarketCandidateView;
import java.time.LocalDate;

public record AdminMarketCandidateView(
    String id,
    String name,
    String regionCode,
    String address,
    Double latitude,
    Double longitude,
    LocalDate sourceDate) {
  static AdminMarketCandidateView from(MarketCandidateView value) {
    return new AdminMarketCandidateView(
        value.id(),
        value.name(),
        value.regionCode(),
        value.address(),
        value.latitude(),
        value.longitude(),
        value.sourceDate());
  }
}
