package com.mirinae.market.modules.checkout.business;

public record OrderOperationResult(StoreOrderView order, boolean changed) {}
