package com.mirinae.market.modules.product.business;

import java.time.LocalTime;

public record PurchaseLine(
    long offerId,
    int quantity,
    int expectedPrice,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline) {}
