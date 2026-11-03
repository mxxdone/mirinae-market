import { apiDeleteEmpty, apiGet, apiPostJson, apiPutJson } from "./client";
import { getLocatedMarkets, getMarketRegions } from "./location";
import {
  ApiError,
  type LocatedMarketView,
  type MarketFilterParams,
  type OfferInput,
  type OfferView,
  type PickupWindowInput,
  type ProductInput,
  type ProductView,
  type ProductPage,
  type OfferPage,
  type SaleBatchInput,
  type SaleProductPage,
} from "./types";

export function getMarkets(
  params?: MarketFilterParams,
  signal?: AbortSignal,
): Promise<LocatedMarketView[]> {
  return getLocatedMarkets(params, signal);
}
export { getMarketRegions };
export function searchOffers(
  marketId: number,
  query: string,
  page = 0,
  signal?: AbortSignal,
): Promise<OfferPage> {
  return apiGet(
    `/api/markets/${marketId}/offers?${new URLSearchParams({ query, page: String(page), size: "20" })}`,
    signal,
  );
}
export function getOffer(
  marketId: number,
  offerId: number,
  signal?: AbortSignal,
): Promise<OfferView> {
  return apiGet(`/api/markets/${marketId}/offers/${offerId}`, signal);
}
export function getProducts(storeId: number, page = 0, size = 20): Promise<ProductPage> {
  return apiGet(`/api/seller/stores/${storeId}/products?page=${page}&size=${size}`);
}
export function getProduct(
  storeId: number,
  productId: number,
  signal?: AbortSignal,
): Promise<ProductView> {
  return apiGet(`/api/seller/stores/${storeId}/products/${productId}`, signal);
}
export function getSaleProducts(storeId: number, date: string, page = 0): Promise<SaleProductPage> {
  return apiGet(`/api/seller/stores/${storeId}/sales/${date}?page=${page}&size=20`);
}
export function applySales(storeId: number, date: string, input: SaleBatchInput): Promise<void> {
  return apiPutJson<void>(`/api/seller/stores/${storeId}/sales/${date}`, input);
}
export function deleteProduct(storeId: number, productId: number): Promise<void> {
  return apiDeleteEmpty(`/api/seller/stores/${storeId}/products/${productId}`);
}
export function createProduct(storeId: number, input: ProductInput): Promise<ProductView> {
  return apiPostJson(`/api/seller/stores/${storeId}/products`, input);
}
export function updateProduct(
  storeId: number,
  productId: number,
  input: ProductInput,
): Promise<ProductView> {
  return apiPutJson(`/api/seller/stores/${storeId}/products/${productId}`, input);
}
export function savePickupWindow(
  storeId: number,
  date: string,
  input: PickupWindowInput,
): Promise<PickupWindowInput> {
  return apiPutJson(`/api/seller/stores/${storeId}/pickup-windows/${date}`, input);
}
export async function getPickupWindow(
  storeId: number,
  date: string,
  signal?: AbortSignal,
): Promise<PickupWindowInput | null> {
  try {
    return await apiGet(`/api/seller/stores/${storeId}/pickup-windows/${date}`, signal);
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 404) return null;
    throw failure;
  }
}
export function saveOffer(
  storeId: number,
  productId: number,
  date: string,
  input: OfferInput,
): Promise<OfferView> {
  return apiPutJson(`/api/seller/stores/${storeId}/products/${productId}/offers/${date}`, input);
}
