import { apiGet, apiPutJson } from "./client";

export interface SellerProfile {
  id: number;
  loginId: string;
  email: string;
  contactName: string | null;
  contactPhone: string | null;
}

export function getSellerProfile(signal?: AbortSignal): Promise<SellerProfile> {
  return apiGet<SellerProfile>("/api/seller/profile", signal);
}

export function changeSellerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ changed: boolean }> {
  return apiPutJson("/api/seller/password", { currentPassword, newPassword });
}
