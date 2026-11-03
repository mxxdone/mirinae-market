import { apiDeleteEmpty, apiGet, apiPostJson, apiPutJson } from "./client";

export interface ReviewSummary {
  storeId: number;
  averageRating: number | null;
  reviewCount: number;
}
export interface Review {
  id: number;
  storeId: number;
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  reply: { content: string; updatedAt: string } | null;
}
export interface ReviewPage<T> {
  items: T[];
  page: number;
  size: number;
  hasNext: boolean;
  totalItems: number;
  summary?: ReviewSummary | null;
}
export interface ReviewEditor {
  storeOrderId: number;
  storeId: number;
  creationDeadline: string;
  canCreate: boolean;
  review: { review: Review; authorDeleted: boolean; adminDeleted: boolean } | null;
}
export interface SellerReview {
  review: Review;
  deletionRequested: boolean;
}
export interface AdminReview {
  id: number;
  storeId: number;
  storeOrderId: number;
  storeName: string;
  rating: number;
  content: string;
  createdAt: string;
  authorDeleted: boolean;
  adminDeleted: boolean;
  adminReason: string | null;
}
export interface ReviewDeletionRequest {
  id: number;
  reviewId: number;
  storeId: number;
  storeName: string;
  rating: number;
  content: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decisionReason: string | null;
  createdAt: string;
}
const own = (order: number) => `/api/buyer/store-orders/${order}/review`;
const seller = (store: number) => `/api/seller/stores/${store}/reviews`;
export function getStoreReviews(
  market: number,
  store: number,
  page = 0,
  signal?: AbortSignal,
): Promise<ReviewPage<Review>> {
  return apiGet(`/api/markets/${market}/stores/${store}/reviews?page=${page}&size=20`, signal);
}
export function getReviewSummaries(
  market: number,
  stores: number[],
  signal?: AbortSignal,
): Promise<ReviewSummary[]> {
  const ids = [...new Set(stores)];
  if (ids.length === 0) return Promise.resolve([]);
  return apiGet(
    `/api/markets/${market}/review-summaries?${new URLSearchParams({ storeIds: ids.join(",") })}`,
    signal,
  );
}
export function getReviewEditor(order: number, signal?: AbortSignal): Promise<ReviewEditor> {
  return apiGet(own(order), signal);
}
export function saveReview(order: number, rating: number, content: string): Promise<ReviewEditor> {
  return apiPutJson(own(order), { rating, content });
}
export function deleteReview(order: number): Promise<void> {
  return apiDeleteEmpty(own(order));
}
export function restoreReview(order: number): Promise<ReviewEditor> {
  return apiPostJson(own(order) + "/restore", {});
}
export function getSellerReviews(
  store: number,
  page = 0,
  signal?: AbortSignal,
): Promise<ReviewPage<SellerReview>> {
  return apiGet(seller(store) + `?page=${page}&size=20`, signal);
}
export function saveReviewReply(store: number, review: number, content: string): Promise<Review> {
  return apiPutJson(seller(store) + `/${review}/reply`, { content });
}
export function requestReviewDeletion(
  store: number,
  review: number,
  reason: string,
): Promise<ReviewDeletionRequest> {
  return apiPostJson(seller(store) + `/${review}/deletion-requests`, { reason });
}
export function getAdminReviews(page = 0, signal?: AbortSignal): Promise<ReviewPage<AdminReview>> {
  return apiGet(`/api/admin/reviews?page=${page}&size=20`, signal);
}
export function getReviewDeletionRequests(
  page = 0,
  signal?: AbortSignal,
): Promise<ReviewPage<ReviewDeletionRequest>> {
  return apiGet(`/api/admin/review-deletion-requests?page=${page}&size=20`, signal);
}
export function adminDeleteReview(review: number, reason: string): Promise<void> {
  return apiPostJson(`/api/admin/reviews/${review}/delete`, { reason });
}
export function adminRestoreReview(review: number): Promise<void> {
  return apiPostJson(`/api/admin/reviews/${review}/restore`, {});
}
export function decideReviewDeletion(
  request: number,
  approved: boolean,
  reason: string,
): Promise<ReviewDeletionRequest> {
  return apiPostJson(`/api/admin/review-deletion-requests/${request}/decision`, {
    approved,
    reason,
  });
}
