package com.mirinae.market.modules.store.business;

public record LocatedMarketView(
    long id,
    String name,
    String regionCode,
    String provinceCode,
    String regionLabel,
    String address,
    Double latitude,
    Double longitude,
    Double distanceKm) {}
