package com.mirinae.market.modules.checkout.business;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record StoreOrderView(
    long id,
    long storeId,
    String storeName,
    LocalDate pickupDate,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline,
    List<OrderItemView> items) {}
