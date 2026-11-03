package com.mirinae.market.modules.store.data;

import java.time.LocalDate;

public record MarketCandidateRow(
    String id,
    String name,
    String regionCode,
    String address,
    Double latitude,
    Double longitude,
    LocalDate sourceDate) {}
