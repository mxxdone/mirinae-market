import { apiGet, apiPostJson, apiPutJson } from "./client";
import type {
  LocatedMarketView,
  MarketCandidateView,
  MarketCreateInput,
  MarketFilterParams,
  MarketUpdateInput,
  RegionView,
} from "./types";

/**
 * 활성화된 시군구 지역 기준 목록을 조회합니다.
 */
export function getMarketRegions(signal?: AbortSignal): Promise<RegionView[]> {
  return apiGet<RegionView[]>("/api/market-regions", signal);
}

/**
 * 구매자용 시장 목록을 조회합니다.
 * 판매자가 연결된 매장이 있는 시장만 반환됩니다.
 * provinceCode, regionCode, query, latitude+longitude 필터가 가능합니다.
 */
export function getLocatedMarkets(
  params?: MarketFilterParams,
  signal?: AbortSignal,
): Promise<LocatedMarketView[]> {
  const searchParams = new URLSearchParams();
  if (params?.provinceCode) {
    searchParams.set("provinceCode", params.provinceCode);
  }
  if (params?.regionCode) {
    searchParams.set("regionCode", params.regionCode);
  }
  if (params?.query && params.query.trim().length > 0) {
    searchParams.set("query", params.query.trim());
  }
  if (params?.latitude !== undefined && params?.longitude !== undefined) {
    searchParams.set("latitude", String(params.latitude));
    searchParams.set("longitude", String(params.longitude));
  }
  const queryString = searchParams.toString();
  return apiGet<LocatedMarketView[]>(
    queryString ? `/api/markets?${queryString}` : "/api/markets",
    signal,
  );
}

/**
 * 관리자용 시장 등록 후보 목록을 조회합니다 (공공데이터 스냅샷 기반).
 */
export function getAdminMarketCandidates(
  query = "",
  page = 0,
  signal?: AbortSignal,
  filters?: Pick<MarketFilterParams, "provinceCode" | "regionCode">,
): Promise<MarketCandidateView[]> {
  const searchParams = new URLSearchParams({
    query: query.trim(),
    page: String(page),
  });
  if (filters?.provinceCode) searchParams.set("provinceCode", filters.provinceCode);
  if (filters?.regionCode) searchParams.set("regionCode", filters.regionCode);
  return apiGet<MarketCandidateView[]>(`/api/admin/market-candidates?${searchParams}`, signal);
}

/**
 * 관리자용 등록 시장 전체 목록을 조회합니다.
 */
export function getAdminMarkets(signal?: AbortSignal): Promise<LocatedMarketView[]> {
  return apiGet<LocatedMarketView[]>("/api/admin/markets", signal);
}

/**
 * 관리자 시장 신규 등록
 * name, regionCode, address, latitude, longitude 모두 필수입니다.
 */
export function createAdminMarket(input: MarketCreateInput): Promise<LocatedMarketView> {
  return apiPostJson<LocatedMarketView>("/api/admin/markets", {
    name: input.name.trim(),
    regionCode: input.regionCode,
    address: input.address.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
  });
}

/**
 * 관리자 시장 이름 및 위치 수정
 * 위치 필드를 모두 생략하면 기존 위치를 보존합니다.
 */
export function updateAdminMarket(
  id: number,
  input: MarketUpdateInput,
): Promise<LocatedMarketView> {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
  };
  if (input.location) {
    body.regionCode = input.location.regionCode;
    body.address = input.location.address.trim();
    body.latitude = input.location.latitude;
    body.longitude = input.location.longitude;
  }
  return apiPutJson<LocatedMarketView>(`/api/admin/markets/${id}`, body);
}
