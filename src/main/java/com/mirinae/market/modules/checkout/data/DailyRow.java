package com.mirinae.market.modules.checkout.data;

/** 수령일 하루의 상태별 주문 건수 집계다. 상태별 합은 전체 건수와 같다. */
public record DailyRow(
    long totalOrders,
    long waitingOrders,
    long pickedUpOrders,
    long noShowOrders,
    long cancelledOrders,
    long partiallyCancelledOrders) {}
