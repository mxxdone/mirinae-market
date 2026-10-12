package com.mirinae.market.modules.product.data;

import java.time.LocalDate;
import java.time.LocalTime;

public record OfferRow(
    long id,
    long productId,
    long marketId,
    long storeId,
    String storeName,
    String productName,
    String description,
    String unitType,
    int unitAmount,
    LocalDate pickupDate,
    int priceWon,
    int onlineQuantity,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline) {}
