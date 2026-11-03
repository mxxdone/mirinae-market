import { apiGet, apiPostMultipart } from "./client";

export interface ProductImage {
  id: string;
  variants: { edge: number; width: number; height: number; url: string }[];
}
export function uploadProductImage(store: number, file: File): Promise<ProductImage> {
  const body = new FormData();
  body.append("file", file);
  return apiPostMultipart(`/api/seller/stores/${store}/product-images`, body);
}
export function getProductImage(
  store: number,
  product: number,
  signal?: AbortSignal,
): Promise<{ image: ProductImage | null }> {
  return apiGet(`/api/seller/stores/${store}/products/${product}/image`, signal);
}
export function getPublicProductImages(
  market: number,
  ids: number[],
  signal?: AbortSignal,
): Promise<{ productId: number; image: ProductImage }[]> {
  return apiGet(
    `/api/markets/${market}/product-images?${new URLSearchParams({ productIds: ids.join(",") })}`,
    signal,
  );
}
