package com.mirinae.market.modules.product.business;

import java.time.LocalDate;
import java.time.LocalTime;

public record PickupWindowView(
    long storeId,
    LocalDate pickupDate,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline) {}
