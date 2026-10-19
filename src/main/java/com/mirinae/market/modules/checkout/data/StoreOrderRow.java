package com.mirinae.market.modules.checkout.data;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

public record StoreOrderRow(
    long id,
    long checkoutId,
    long buyerId,
    long storeId,
    String storeName,
    LocalDate pickupDate,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline,
    String pickupCode,
    Instant pickedUpAt) {}
