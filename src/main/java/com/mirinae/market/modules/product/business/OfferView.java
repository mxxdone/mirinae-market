package com.mirinae.market.modules.product.business;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

public record OfferView(
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
    long inventoryVersion,
    LocalTime startTime,
    LocalTime endTime,
    LocalTime orderDeadline,
    String comparisonUnit,
    BigDecimal comparisonPriceWon) {}
