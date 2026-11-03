package com.mirinae.market.modules.checkout.data;

import java.math.BigInteger;

/** 원결제 확정 월에 귀속한 결제·완료 환불 금액이다. */
public record MonthlyRow(BigInteger paymentWon, BigInteger refundWon) {}
