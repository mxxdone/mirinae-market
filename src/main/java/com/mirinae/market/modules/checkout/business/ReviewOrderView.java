package com.mirinae.market.modules.checkout.business;

import java.time.Instant;

public record ReviewOrderView(long storeOrderId, long storeId, Instant pickedUpAt) {}
