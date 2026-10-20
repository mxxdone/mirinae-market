package com.mirinae.market.modules.checkout.business;

import java.time.Instant;
import java.util.List;

/** 판매자 대시보드 응답. 금액은 정밀도 손실 없는 10진 문자열이다. */
public record SellerDashboardView(
    Instant asOf,
    String date,
    String month,
    Daily daily,
    List<PreparationItem> preparationItems,
    Lifetime lifetime,
    Monthly monthly) {

  /** 수령일 하루의 상태별 주문 건수. 상태별 합은 전체 건수와 같다. */
  public record Daily(
      long totalOrders,
      long waitingOrders,
      long pickedUpOrders,
      long noShowOrders,
      long cancelledOrders,
      long partiallyCancelledOrders) {}

  /** 주문 스냅샷의 상품명·판매 구성과 상품 ID로 구분한 준비 수량. */
  public record PreparationItem(
      long productId, String productName, String unitType, int unitAmount, long quantity) {}

  /** 전체 기간 누적 주문·구매자와 결제·완료 환불 금액. */
  public record Lifetime(
      long orderCount, long buyerCount, String paymentWon, String refundWon, String netWon) {}

  /** 선택 월의 결제·완료 환불 금액. 환불은 원결제 확정 월에 귀속한다. */
  public record Monthly(String paymentWon, String refundWon, String netWon) {}
}
