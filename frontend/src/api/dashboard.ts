import { apiGet } from "./client";
import type { UnitType } from "./types";

export interface DailySummaryView {
  totalOrders: number;
  waitingOrders: number;
  pickedUpOrders: number;
  noShowOrders: number;
  cancelledOrders: number;
  partiallyCancelledOrders: number;
}

export interface PreparationItemView {
  productId: number;
  productName: string;
  unitType: UnitType;
  unitAmount: number;
  quantity: number;
}

export interface LifetimeMetricsView {
  orderCount: number;
  buyerCount: number;
  paymentWon: string;
  refundWon: string;
  netWon: string;
}

export interface MonthlyMetricsView {
  paymentWon: string;
  refundWon: string;
  netWon: string;
}

export interface SellerDashboardView {
  asOf: string;
  date: string;
  month: string;
  daily: DailySummaryView;
  preparationItems: PreparationItemView[];
  lifetime: LifetimeMetricsView;
  monthly: MonthlyMetricsView;
}

export interface SellerDashboardParams {
  date?: string;
  month?: string;
}

/** 판매자 매장 대시보드 조회 API */
export async function getSellerDashboard(
  storeId: number,
  params?: SellerDashboardParams,
  signal?: AbortSignal,
): Promise<SellerDashboardView> {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.set("date", params.date);
  if (params?.month) searchParams.set("month", params.month);

  const query = searchParams.toString();
  const path = query
    ? `/api/seller/stores/${storeId}/dashboard?${query}`
    : `/api/seller/stores/${storeId}/dashboard`;

  return apiGet<SellerDashboardView>(path, signal);
}

/**
 * 금액 문자열을 BigInt로 안전하게 포맷팅합니다.
 * 숫자가 아니거나 유효하지 않은 문자열이면 숨기지 않고 '확인 불가'를 반환합니다.
 */
export function formatWon(won: string): string {
  const trimmed = won ? won.trim() : "";
  if (!trimmed || !/^-?\d+$/.test(trimmed)) {
    return "확인 불가";
  }
  try {
    return `${BigInt(trimmed).toLocaleString("ko-KR")}원`;
  } catch {
    return "확인 불가";
  }
}

/** 상품 판매 구성 단위 표시 */
export function formatUnit(unitType: UnitType, unitAmount: number): string {
  return unitType === "WEIGHT" ? `${unitAmount}g` : `${unitAmount}개`;
}
