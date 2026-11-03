import { apiGet } from "./client";
import type { OfferPage, StorePage, StoreView } from "./types";

/**
 * 로그인한 판매자의 담당 매장을 서버 세션으로 조회합니다.
 */
export async function getCurrentSellerStore(): Promise<StoreView> {
  return apiGet<StoreView>("/api/seller/stores/me");
}

/**
 * 시장에 등록된 공개 매장 목록을 검색합니다.
 */
export function searchStores(
  marketId: number,
  query = "",
  page = 0,
  signal?: AbortSignal,
): Promise<StorePage> {
  const searchParams = new URLSearchParams({
    query,
    page: String(page),
    size: "20",
  });
  return apiGet(`/api/markets/${marketId}/stores?${searchParams.toString()}`, signal);
}

/**
 * 시장 내 특정 매장의 기본 정보를 조회합니다.
 */
export function getMarketStore(
  marketId: number,
  storeId: number,
  signal?: AbortSignal,
): Promise<StoreView> {
  return apiGet(`/api/markets/${marketId}/stores/${storeId}`, signal);
}

/**
 * 시장 내 특정 매장의 오늘 공개 판매 상품 목록을 조회합니다.
 */
export function getStoreOffers(
  marketId: number,
  storeId: number,
  query = "",
  page = 0,
  signal?: AbortSignal,
): Promise<OfferPage> {
  const searchParams = new URLSearchParams({
    query,
    page: String(page),
    size: "20",
  });
  return apiGet(
    `/api/markets/${marketId}/stores/${storeId}/offers?${searchParams.toString()}`,
    signal,
  );
}
