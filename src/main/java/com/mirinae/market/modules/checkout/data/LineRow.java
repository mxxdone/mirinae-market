package com.mirinae.market.modules.checkout.data;

import java.time.LocalTime;

public record LineRow(
    long offerId,
    int quantity,
    int expectedPrice,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline) {}
