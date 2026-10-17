import { apiGet, apiPostJson, apiPutJson } from "./client";
import {
  createAdminMarket,
  getAdminMarketCandidates,
  getAdminMarkets as fetchAdminMarkets,
  updateAdminMarket,
} from "./location";
import type {
  LocatedMarketView,
  MarketCandidateView,
  MarketCreateInput,
  MarketUpdateInput,
} from "./types";

export type { MarketCandidateView };

export type AdminRow = { id: number } & Record<string, string | number | boolean | null>;

export type AdminSection =
  "markets" | "stores" | "sellers" | "buyers" | "orders" | "sales" | "changes";

export interface AdminFilters {
  query: string;
  page: number;
  date: string;
  type: string;
  from: string;
  until: string;
  targetId: string;
}

export async function getAdminRows(
  section: AdminSection,
  filters: AdminFilters,
  signal?: AbortSignal,
): Promise<AdminRow[]> {
  if (section === "markets") {
    const rows = await apiGet<AdminRow[]>("/api/admin/markets", signal);
    return rows
      .filter((row) => String(row.name).toLowerCase().includes(filters.query.toLowerCase()))
      .slice(filters.page * 50, filters.page * 50 + 51);
  }

  const params = new URLSearchParams({ page: String(filters.page) });
  if (section !== "changes") {
    params.set("query", filters.query);
  }

  let endpoint: string = section;
  if (section === "sellers" || section === "buyers") {
    endpoint = "members";
    params.set("role", section === "sellers" ? "SELLER" : "BUYER");
  }
  if (section === "sales" && filters.date) {
    params.set("date", filters.date);
  }
  if (section === "changes") {
    params.set("type", filters.type);
    const trimmedTargetId = filters.targetId.trim();
    if (trimmedTargetId) {
      params.set("targetId", trimmedTargetId);
    }
    if (filters.from) {
      params.set("from", filters.from);
    }
    if (filters.until) {
      params.set("until", filters.until);
    }
  }

  return apiGet<AdminRow[]>(`/api/admin/${endpoint}?${params}`, signal);
}

export function getAdminMarkets(signal?: AbortSignal): Promise<LocatedMarketView[]> {
  return fetchAdminMarkets(signal);
}

export function getAdminOrderItems(id: number, signal?: AbortSignal): Promise<AdminRow[]> {
  return apiGet<AdminRow[]>(`/api/admin/orders/${id}/items`, signal);
}

export { getAdminMarketCandidates };

export function createMarket(input: MarketCreateInput): Promise<LocatedMarketView> {
  return createAdminMarket(input);
}

export function updateMarket(id: number, input: MarketUpdateInput): Promise<LocatedMarketView> {
  return updateAdminMarket(id, input);
}

export function registerStore(input: {
  marketId: number;
  name: string;
  loginId: string;
  password: string;
  email: string;
  contactName: string;
  contactPhone: string;
}): Promise<AdminRow> {
  return apiPostJson("/api/admin/stores", input);
}

export function renameManaged(
  section: "markets" | "stores",
  id: number,
  name: string,
): Promise<AdminRow> {
  return apiPutJson(`/api/admin/${section}/${id}`, { name });
}

export function updateSellerContact(
  id: number,
  input: { contactName: string; contactPhone: string; email: string },
): Promise<AdminRow> {
  return apiPutJson(`/api/admin/sellers/${id}/contact`, input);
}
