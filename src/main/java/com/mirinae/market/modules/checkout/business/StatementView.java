package com.mirinae.market.modules.checkout.business;

import java.time.Instant;
import java.util.List;

public record StatementView(
    long id,
    Instant confirmedAt,
    String totalWon,
    List<StoreOrderView> storeOrders,
    String testNotice) {}
