package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.store.business.LocatedMarketView;

public record AdminMarketView(
    long id,
    String name,
    String regionCode,
    String provinceCode,
    String regionLabel,
    String address,
    Double latitude,
    Double longitude,
    Double distanceKm) {
  static AdminMarketView from(LocatedMarketView value) {
    return new AdminMarketView(
        value.id(),
        value.name(),
        value.regionCode(),
        value.provinceCode(),
        value.regionLabel(),
        value.address(),
        value.latitude(),
        value.longitude(),
        value.distanceKm());
  }
}
