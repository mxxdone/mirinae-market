package com.mirinae.market.modules.admin.business;

public record AdminMarketInput(
    String name, String regionCode, String address, Double latitude, Double longitude) {}
