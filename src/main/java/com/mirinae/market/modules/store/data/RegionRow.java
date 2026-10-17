package com.mirinae.market.modules.store.data;

public record RegionRow(
    String code,
    String provinceCode,
    String provinceName,
    String provinceShortName,
    String districtName) {}
