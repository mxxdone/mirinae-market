import { apiGet, apiPutJson, apiPostJson, apiDeleteEmpty } from "./client";
import type { OfferView } from "./types";
export interface CartItem {
  offer: OfferView;
  quantity: number;
  expectedPrice: number;
  available: boolean;
  changed: boolean;
}
export interface Cart {
  version: number;
  items: CartItem[];
}
export interface OrderItem {
  productName: string;
  unitType: string;
  unitAmount: number;
  priceWon: number;
  quantity: number;
}
export interface StoreOrder {
  id: number;
  storeId: number;
  storeName: string;
  pickupDate: string;
  startTime: string;
  endTime: string;
  orderDeadline: string;
  items: OrderItem[];
}
export interface Checkout {
  id: number;
  requestKey: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  errorCode: string | null;
  message: string | null;
  totalWon: string;
  storeOrders: StoreOrder[];
}
export type PaymentMode = "SUCCESS" | "FAIL" | "DELAY" | "LOST_RESPONSE";
export interface PaymentInput {
  requestKey: string;
  cartVersion: number;
  mode: PaymentMode;
}
export function getCart(): Promise<Cart> {
  return apiGet("/api/buyer/cart");
}
export function putCartItem(
  offer: Pick<OfferView, "id" | "marketId">,
  quantity: number,
): Promise<Cart> {
  return apiPutJson(`/api/buyer/cart/items/${offer.id}`, { marketId: offer.marketId, quantity });
}
export async function removeCartItem(id: number): Promise<Cart> {
  await apiDeleteEmpty(`/api/buyer/cart/items/${id}`);
  return getCart();
}
export async function clearCart(): Promise<Cart> {
  await apiDeleteEmpty("/api/buyer/cart");
  return getCart();
}
export function startCheckout(input: PaymentInput): Promise<Checkout> {
  return apiPostJson("/api/buyer/checkouts", input);
}
export function getCheckout(key: string): Promise<Checkout> {
  return apiGet(`/api/buyer/checkouts/${encodeURIComponent(key)}`);
}
export function getOrders(): Promise<Checkout[]> {
  return apiGet("/api/buyer/orders");
}
