package com.mirinae.market.modules.checkout.data;

import java.time.LocalDate;
import java.time.LocalTime;

public record OrderRow(
    long storeOrderId,
    long storeId,
    String storeName,
    LocalDate pickupDate,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline,
    String productName,
    String unitType,
    int unitAmount,
    int priceWon,
    int quantity) {}
