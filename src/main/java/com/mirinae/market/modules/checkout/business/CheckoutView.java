package com.mirinae.market.modules.checkout.business;

import java.util.List;

public record CheckoutView(
    long id,
    String requestKey,
    String status,
    String errorCode,
    String message,
    String totalWon,
    List<StoreOrderView> storeOrders) {}
