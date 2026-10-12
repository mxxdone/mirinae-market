import { apiGet, apiPostJson, apiPutJson } from "./client";
import {
  ApiError,
  type MarketView,
  type OfferInput,
  type OfferView,
  type PickupWindowInput,
  type ProductInput,
  type ProductView,
  type ResultPage,
  type StoreView,
} from "./types";

export function getMarkets(): Promise<MarketView[]> {
  return apiGet("/api/markets");
}
export function searchOffers(
  marketId: number,
  query: string,
  page = 0,
  signal?: AbortSignal,
): Promise<ResultPage<OfferView>> {
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
export function getProducts(storeId: number, page = 0): Promise<ResultPage<ProductView>> {
  return apiGet(`/api/seller/stores/${storeId}/products?page=${page}&size=20`);
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
/** 공개된 동일 상품 ID만 페이지를 넘어 확인한다. */
export async function findProductOffer(
  store: StoreView,
  product: ProductView,
  signal?: AbortSignal,
): Promise<OfferView | null> {
  let page = 0;
  while (!signal?.aborted) {
    const result = await searchOffers(store.marketId, product.name, page, signal);
    const offer = result.items.find(
      (item) => item.storeId === store.id && item.productId === product.id,
    );
    if (offer) return offer;
    if (!result.hasNext) return null;
    ++page;
  }
  return null;
}
