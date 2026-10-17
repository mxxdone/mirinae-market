import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";
import {
  createAdminMarket,
  getAdminMarketCandidates,
  getAdminMarkets,
  getLocatedMarkets,
  getMarketRegions,
  updateAdminMarket,
} from "./location";
import type { LocatedMarketView, MarketCandidateView, RegionView } from "./types";

describe("location API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAdminMarkets", () => {
    it("/api/admin/markets 엔드포인트를 호출한다", async () => {
      const mockMarkets: LocatedMarketView[] = [];
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockMarkets);
      const result = await getAdminMarkets();
      expect(apiGetSpy).toHaveBeenCalledWith("/api/admin/markets", undefined);
      expect(result).toEqual(mockMarkets);
    });
  });

  describe("getMarketRegions", () => {
    it("/api/market-regions 엔드포인트를 호출한다", async () => {
      const mockRegions: RegionView[] = [
        {
          code: "11110",
          provinceCode: "11",
          provinceName: "서울특별시",
          provinceShortName: "서울",
          districtName: "종로구",
        },
      ];
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockRegions);

      const result = await getMarketRegions();
      expect(apiGetSpy).toHaveBeenCalledWith("/api/market-regions", undefined);
      expect(result).toEqual(mockRegions);
    });
  });

  describe("getLocatedMarkets", () => {
    it("필터 파라미터가 없으면 /api/markets 기본 목록을 호출한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue([]);
      await getLocatedMarkets();
      expect(apiGetSpy).toHaveBeenCalledWith("/api/markets", undefined);
    });

    it("시도·시군구·검색어·좌표 필터를 쿼리 스트링으로 올바르게 구성한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue([]);
      await getLocatedMarkets({
        provinceCode: "11",
        regionCode: "11110",
        query: "광장",
        latitude: 37.57,
        longitude: 126.99,
      });

      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/markets?provinceCode=11&regionCode=11110&query=%EA%B4%91%EC%9E%A5&latitude=37.57&longitude=126.99",
        undefined,
      );
    });

    it("위도 또는 경도 중 하나만 있으면 좌표 파라미터를 전송하지 않는다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue([]);
      await getLocatedMarkets({
        latitude: 37.57,
      });

      expect(apiGetSpy).toHaveBeenCalledWith("/api/markets", undefined);
    });
  });

  describe("getAdminMarketCandidates", () => {
    it("관리자 후보 검색 쿼리와 페이지를 전송한다", async () => {
      const mockCandidates: MarketCandidateView[] = [
        {
          id: "abc",
          name: "중앙시장",
          regionCode: "11110",
          address: "서울시 종로구",
          latitude: 37.57,
          longitude: 126.99,
          sourceDate: "2025-11-10",
        },
      ];
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockCandidates);

      const result = await getAdminMarketCandidates("중앙", 1);
      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/admin/market-candidates?query=%EC%A4%91%EC%95%99&page=1",
        undefined,
      );
      expect(result).toEqual(mockCandidates);
    });
  });

  describe("createAdminMarket and updateAdminMarket", () => {
    it("새 시장 등록 시 필수 위치 5개 필드를 POST로 전송한다", async () => {
      const mockCreated: LocatedMarketView = {
        id: 10,
        name: "새시장",
        regionCode: "11110",
        provinceCode: "11",
        regionLabel: "서울 종로구",
        address: "서울시 종로구 123",
        latitude: 37.57,
        longitude: 126.99,
        distanceKm: null,
      };
      const apiPostSpy = vi.spyOn(client, "apiPostJson").mockResolvedValue(mockCreated);

      const result = await createAdminMarket({
        name: "  새시장  ",
        regionCode: "11110",
        address: "  서울시 종로구 123  ",
        latitude: 37.57,
        longitude: 126.99,
      });

      expect(apiPostSpy).toHaveBeenCalledWith("/api/admin/markets", {
        name: "새시장",
        regionCode: "11110",
        address: "서울시 종로구 123",
        latitude: 37.57,
        longitude: 126.99,
      });
      expect(result).toEqual(mockCreated);
    });

    it("시장 수정 시 위치 필드를 생략하면 name만 PUT으로 전송하여 기존 위치를 보존한다", async () => {
      const mockUpdated: LocatedMarketView = {
        id: 10,
        name: "수정시장",
        regionCode: "11110",
        provinceCode: "11",
        regionLabel: "서울 종로구",
        address: "기존주소",
        latitude: 37.57,
        longitude: 126.99,
        distanceKm: null,
      };
      const apiPutSpy = vi.spyOn(client, "apiPutJson").mockResolvedValue(mockUpdated);

      const result = await updateAdminMarket(10, {
        name: "수정시장",
      });

      expect(apiPutSpy).toHaveBeenCalledWith("/api/admin/markets/10", {
        name: "수정시장",
      });
      expect(result).toEqual(mockUpdated);
    });

    it("시장 수정 시 위치 정보를 포함하면 4개 위치 필드를 함께 전송한다", async () => {
      const mockUpdated: LocatedMarketView = {
        id: 10,
        name: "수정시장",
        regionCode: "11140",
        provinceCode: "11",
        regionLabel: "서울 중구",
        address: "새주소",
        latitude: 37.56,
        longitude: 126.98,
        distanceKm: null,
      };
      const apiPutSpy = vi.spyOn(client, "apiPutJson").mockResolvedValue(mockUpdated);

      const result = await updateAdminMarket(10, {
        name: "수정시장",
        location: {
          regionCode: "11140",
          address: "새주소",
          latitude: 37.56,
          longitude: 126.98,
        },
      });

      expect(apiPutSpy).toHaveBeenCalledWith("/api/admin/markets/10", {
        name: "수정시장",
        regionCode: "11140",
        address: "새주소",
        latitude: 37.56,
        longitude: 126.98,
      });
      expect(result).toEqual(mockUpdated);
    });
  });
});
