package com.mirinae.market.modules.store.business;

public record RegionView(
    String code,
    String provinceCode,
    String provinceName,
    String provinceShortName,
    String districtName) {}
