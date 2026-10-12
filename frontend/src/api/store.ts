import { apiGet } from "./client";
import type { StoreView } from "./types";

/**
 * 로그인한 판매자의 담당 매장을 서버 세션으로 조회합니다.
 */
export async function getCurrentSellerStore(): Promise<StoreView> {
  return apiGet<StoreView>("/api/seller/stores/me");
}
