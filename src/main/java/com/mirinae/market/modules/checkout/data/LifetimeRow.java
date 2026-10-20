package com.mirinae.market.modules.checkout.data;

import java.math.BigInteger;

/** 전체 기간 누적 주문·구매자와 결제·완료 환불 금액이다. */
public record LifetimeRow(
    long orderCount, long buyerCount, BigInteger paymentWon, BigInteger refundWon) {}
