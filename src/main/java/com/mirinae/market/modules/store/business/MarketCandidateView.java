package com.mirinae.market.modules.store.business;

import java.time.LocalDate;

public record MarketCandidateView(
    String id,
    String name,
    String regionCode,
    String address,
    Double latitude,
    Double longitude,
    LocalDate sourceDate) {}
