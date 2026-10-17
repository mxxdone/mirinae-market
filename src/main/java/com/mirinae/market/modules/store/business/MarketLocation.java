package com.mirinae.market.modules.store.business;

public record MarketLocation(
    String regionCode, String address, Double latitude, Double longitude) {}
