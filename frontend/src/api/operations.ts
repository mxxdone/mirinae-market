import { apiGet, apiPatchJson, apiPostJson, apiPutJson } from "./client";
import type { UnitType } from "./types";

export type StoreOrderStatus = "WAITING" | "PICKED_UP" | "NO_SHOW" | "CANCELLED";
export type RefundStatus = "PENDING" | "COMPLETED" | "NEEDS_ATTENTION";
export type ReportType = "CLOSURE_SUSPECTED" | "INACTIVE" | "LOCATION_ERROR";
export type ReportStatus = "OPEN" | "REVIEWING" | "RESOLVED";
export type CancellationKind = "GENERAL" | "REMAINDER";
export type AdminCancellationReasonType = "BUYER_REQUEST" | "STORE_FAULT" | "SERVICE_ERROR";

export interface OrderItemView {
  id: number;
  productName: string;
  unitType: UnitType | string;
  unitAmount: number;
  priceWon: number;
  quantity: number;
  cancelled: boolean;
  cancellationType: string | null;
  cancellationReason: string | null;
}

export interface RefundView {
  id: number;
  storeOrderId: number;
  amountWon: string;
  status: RefundStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface StoreOrderView {
  id: number;
  storeId: number;
  storeName: string;
  pickupDate: string;
  startTime: string;
  endTime: string;
  orderDeadline: string;
  items: OrderItemView[];
  status: StoreOrderStatus;
  pickupCode: string | null;
  hasFulfillmentFailure: boolean;
  canCancel: boolean;
  canCancelRemaining: boolean;
  cancelledWon: string;
  refundedWon: string;
  refunds: RefundView[];
}

export interface StoreOrderPage {
  items: StoreOrderView[];
  page: number;
  hasNext: boolean;
}

export interface StoreReportView {
  id: number;
  storeId: number;
  storeName: string;
  type: ReportType;
  description: string;
  status: ReportStatus;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedStoreReportView {
  report: StoreReportView;
  buyerLoginId: string;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  unresolvedClosureCount: number;
  needsContact: boolean;
}

export function formatStoreOrderStatus(status: StoreOrderStatus): string {
  switch (status) {
    case "WAITING":
      return "수령 대기";
    case "PICKED_UP":
      return "수령 완료";
    case "NO_SHOW":
      return "미수령";
    case "CANCELLED":
      return "취소 완료";
    default:
      return status;
  }
}

export function formatRefundStatus(status: RefundStatus): string {
  switch (status) {
    case "PENDING":
      return "처리 대기";
    case "COMPLETED":
      return "환불 완료";
    case "NEEDS_ATTENTION":
      return "확인 필요";
    default:
      return status;
  }
}

export function formatReportType(type: ReportType): string {
  switch (type) {
    case "CLOSURE_SUSPECTED":
      return "폐업 의심";
    case "INACTIVE":
      return "장기 미운영";
    case "LOCATION_ERROR":
      return "위치 오류";
    default:
      return type;
  }
}

export function formatReportStatus(status: ReportStatus): string {
  switch (status) {
    case "OPEN":
      return "접수";
    case "REVIEWING":
      return "확인 중";
    case "RESOLVED":
      return "처리 완료";
    default:
      return status;
  }
}

export function formatAdminCancellationReasonType(type: AdminCancellationReasonType): string {
  switch (type) {
    case "BUYER_REQUEST":
      return "구매자 요청";
    case "STORE_FAULT":
      return "매장 귀책";
    case "SERVICE_ERROR":
      return "서비스 오류";
    default:
      return type;
  }
}

// ----------------------------------------------------
// 구매자 API
// ----------------------------------------------------

export function getBuyerStoreOrder(id: number, signal?: AbortSignal): Promise<StoreOrderView> {
  return apiGet(`/api/buyer/store-orders/${id}`, signal);
}

export function cancelBuyerStoreOrder(
  id: number,
  input: { requestKey: string; kind: CancellationKind },
): Promise<StoreOrderView> {
  return apiPostJson(`/api/buyer/store-orders/${id}/cancellations`, input);
}

export function reportStore(
  storeId: number,
  input: { type: ReportType; description: string },
): Promise<StoreReportView> {
  return apiPostJson(`/api/buyer/stores/${storeId}/reports`, input);
}

export function getStoreReports(storeId: number, signal?: AbortSignal): Promise<StoreReportView[]> {
  return apiGet(`/api/buyer/stores/${storeId}/reports`, signal);
}

// ----------------------------------------------------
// 판매자 API
// ----------------------------------------------------

export function getSellerStoreOrders(
  storeId: number,
  params?: { date?: string; page?: number },
  signal?: AbortSignal,
): Promise<StoreOrderPage> {
  const search = new URLSearchParams();
  if (params?.date) search.set("date", params.date);
  if (params?.page !== undefined) search.set("page", String(params.page));
  const query = search.toString();
  return apiGet(`/api/seller/stores/${storeId}/orders${query ? `?${query}` : ""}`, signal);
}

export function getSellerStoreOrder(
  storeId: number,
  id: number,
  signal?: AbortSignal,
): Promise<StoreOrderView> {
  return apiGet(`/api/seller/stores/${storeId}/orders/${id}`, signal);
}

export function pickupStoreOrder(
  storeId: number,
  id: number,
  input: { code: string },
): Promise<StoreOrderView> {
  return apiPostJson(`/api/seller/stores/${storeId}/orders/${id}/pickup`, input);
}

export function recordOrderFailure(
  storeId: number,
  id: number,
  input: { requestKey: string; itemIds: number[]; reason: string },
): Promise<StoreOrderView> {
  return apiPostJson(`/api/seller/stores/${storeId}/orders/${id}/failures`, input);
}

// ----------------------------------------------------
// 관리자 API
// ----------------------------------------------------

export function getAdminManagedStoreOrders(
  checkoutId: number,
  signal?: AbortSignal,
): Promise<StoreOrderView[]> {
  return apiGet(`/api/admin/orders/${checkoutId}/store-orders`, signal);
}

export function cancelAdminStoreOrder(
  id: number,
  input: {
    requestKey: string;
    reasonType: AdminCancellationReasonType;
    reason: string;
  },
): Promise<StoreOrderView> {
  return apiPostJson(`/api/admin/store-orders/${id}/cancellations`, input);
}

export function getAdminRefunds(page = 0, signal?: AbortSignal): Promise<RefundView[]> {
  return apiGet(`/api/admin/refunds?page=${page}`, signal);
}

export function retryAdminRefund(id: number): Promise<void> {
  return apiPostJson<void>(`/api/admin/refunds/${id}/retry`, {});
}

export function getAdminStoreReports(
  params?: { status?: string; page?: number },
  signal?: AbortSignal,
): Promise<ManagedStoreReportView[]> {
  const search = new URLSearchParams();
  if (params?.status !== undefined) search.set("status", params.status);
  if (params?.page !== undefined) search.set("page", String(params.page));
  const query = search.toString();
  return apiGet(`/api/admin/store-reports${query ? `?${query}` : ""}`, signal);
}

export function resolveAdminStoreReport(
  id: number,
  input: { status: string; resolution: string },
): Promise<void> {
  return apiPatchJson(`/api/admin/store-reports/${id}`, input);
}

export function updateStoreOperation(
  storeId: number,
  input: { suspended: boolean; reason: string },
): Promise<void> {
  return apiPutJson(`/api/admin/stores/${storeId}/operation`, input);
}
