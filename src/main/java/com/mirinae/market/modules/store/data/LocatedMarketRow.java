package com.mirinae.market.modules.store.data;

public record LocatedMarketRow(
    long id,
    String name,
    String regionCode,
    String provinceCode,
    String regionLabel,
    String address,
    Double latitude,
    Double longitude) {}
