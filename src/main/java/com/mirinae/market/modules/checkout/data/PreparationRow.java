package com.mirinae.market.modules.checkout.data;

/** 수령 대기 주문의 미취소 항목을 상품 스냅샷과 상품 ID로 묶은 준비 수량이다. */
public record PreparationRow(
    long productId, String productName, String unitType, int unitAmount, long quantity) {}
