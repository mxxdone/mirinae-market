package com.mirinae.market.modules.checkout.business;

import java.time.LocalTime;

public record CheckoutItemConditions(
    Long offerId,
    Integer quantity,
    Integer expectedPrice,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline) {}
