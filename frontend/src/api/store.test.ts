import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";
import { getCurrentSellerStore, getMarketStore, getStoreOffers, searchStores } from "./store";
import type { OfferPage, StorePage, StoreView } from "./types";

describe("store API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCurrentSellerStore", () => {
    it("/api/seller/stores/me 엔드포인트를 호출한다", async () => {
      const mockStore: StoreView = { id: 1, marketId: 10, name: "판매자 매장" };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockStore);
      const result = await getCurrentSellerStore();
      expect(apiGetSpy).toHaveBeenCalledWith("/api/seller/stores/me");
      expect(result).toEqual(mockStore);
    });
  });

  describe("searchStores", () => {
    it("기본 검색 파라미터로 매장 목록을 조회한다", async () => {
      const mockPage: StorePage = {
        items: [{ id: 1, marketId: 10, name: "청과물상회" }],
        page: 0,
        size: 20,
        hasNext: false,
        totalItems: 1,
      };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockPage);
      const result = await searchStores(10);
      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/markets/10/stores?query=&page=0&size=20",
        undefined,
      );
      expect(result).toEqual(mockPage);
    });

    it("검색어와 페이지 번호를 쿼리 파라미터로 전달한다", async () => {
      const mockPage: StorePage = {
        items: [],
        page: 2,
        size: 20,
        hasNext: false,
        totalItems: 0,
      };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockPage);
      const signal = new AbortController().signal;
      const result = await searchStores(10, "사과", 2, signal);
      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/markets/10/stores?query=%EC%82%AC%EA%B3%BC&page=2&size=20",
        signal,
      );
      expect(result).toEqual(mockPage);
    });
  });

  describe("getMarketStore", () => {
    it("특정 매장의 기본 정보를 조회한다", async () => {
      const mockStore: StoreView = { id: 42, marketId: 10, name: "단골청과" };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockStore);
      const signal = new AbortController().signal;
      const result = await getMarketStore(10, 42, signal);
      expect(apiGetSpy).toHaveBeenCalledWith("/api/markets/10/stores/42", signal);
      expect(result).toEqual(mockStore);
    });
  });

  describe("getStoreOffers", () => {
    it("특정 매장의 오늘 판매 상품 목록을 조회한다", async () => {
      const mockOfferPage: OfferPage = {
        items: [],
        page: 0,
        size: 20,
        hasNext: false,
        totalItems: 0,
      };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockOfferPage);
      const signal = new AbortController().signal;
      const result = await getStoreOffers(10, 42, "", 0, signal);
      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/markets/10/stores/42/offers?query=&page=0&size=20",
        signal,
      );
      expect(result).toEqual(mockOfferPage);
    });
  });
});
