import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMarketLocation,
  leaveMarketLocation,
  readMarketLocation,
  writeMarketLocation,
} from "./marketLocation";

interface MockWindow {
  location: { hash: string; pathname: string; search: string };
  history: {
    state: unknown;
    pushState: ReturnType<typeof vi.fn>;
    replaceState: ReturnType<typeof vi.fn>;
  };
}

describe("marketLocation", () => {
  let mockWindow: MockWindow;

  beforeEach(() => {
    mockWindow = {
      location: { hash: "", pathname: "/", search: "" },
      history: {
        state: null,
        pushState: vi.fn((state, _, hash) => {
          mockWindow.history.state = state;
          mockWindow.location.hash = hash;
        }),
        replaceState: vi.fn((state, _, hash) => {
          mockWindow.history.state = state;
          mockWindow.location.hash = hash;
        }),
      },
    };
    (globalThis as unknown as { window: MockWindow }).window = mockWindow;
  });

  it("해시가 비어있을 때 기본값을 반환한다", () => {
    const loc = readMarketLocation("");
    expect(loc).toEqual({
      marketId: null,
      tab: "offers",
      query: "",
      page: 0,
      offerId: null,
      storeQuery: "",
      storePage: 0,
      storeId: null,
      storeOfferPage: 0,
    });
    expect(isMarketLocation()).toBe(false);
  });

  it("상품 탭 쿼리와 페이지를 파싱한다", () => {
    const loc = readMarketLocation("#market?market=10&query=%EC%82%AC%EA%B3%BC&page=2");
    expect(loc.marketId).toBe(10);
    expect(loc.tab).toBe("offers");
    expect(loc.query).toBe("사과");
    expect(loc.page).toBe(2);
    expect(loc.offerId).toBeNull();
  });

  it("매장 탭 쿼리와 페이지를 파싱한다", () => {
    const loc = readMarketLocation(
      "#market?market=10&tab=stores&storeQuery=%EC%B2%AD%EA%B3%BC&storePage=1",
    );
    expect(loc.marketId).toBe(10);
    expect(loc.tab).toBe("stores");
    expect(loc.storeQuery).toBe("청과");
    expect(loc.storePage).toBe(1);
    expect(loc.storeId).toBeNull();
  });

  it("개별 매장 식별자와 매장 상품 페이지를 파싱한다", () => {
    const loc = readMarketLocation("#market?market=10&store=42&storeOfferPage=3");
    expect(loc.marketId).toBe(10);
    expect(loc.storeId).toBe(42);
    expect(loc.storeOfferPage).toBe(3);
  });

  it("허용 범위를 초과한 페이지 번호는 0으로 정규화한다", () => {
    const loc = readMarketLocation(
      "#market?market=10&page=999999999&storePage=999999999&storeOfferPage=999999999",
    );
    expect(loc.page).toBe(0);
    expect(loc.storePage).toBe(0);
    expect(loc.storeOfferPage).toBe(0);
  });

  it("writeMarketLocation으로 매장 상품 페이지를 URL에 기록한다", () => {
    writeMarketLocation({
      marketId: 5,
      tab: "stores",
      query: "",
      page: 0,
      offerId: null,
      storeId: 12,
      storeOfferPage: 2,
    });
    expect(mockWindow.location.hash).toContain("market=5");
    expect(mockWindow.location.hash).toContain("store=12");
    expect(mockWindow.location.hash).toContain("storeOfferPage=2");
  });

  it("writeMarketLocation으로 매장 탭 URL과 상태를 기록한다", () => {
    writeMarketLocation({
      marketId: 5,
      tab: "stores",
      query: "",
      page: 0,
      offerId: null,
      storeQuery: "야채",
      storePage: 2,
    });
    expect(mockWindow.location.hash).toContain("market=5");
    expect(mockWindow.location.hash).toContain("tab=stores");
    expect(mockWindow.location.hash).toContain("storeQuery=%EC%95%BC%EC%B1%84");
    expect(mockWindow.location.hash).toContain("storePage=2");
  });

  it("writeMarketLocation으로 개별 매장 방문 기록을 push한다", () => {
    writeMarketLocation(
      {
        marketId: 5,
        tab: "stores",
        query: "",
        page: 0,
        offerId: null,
        storeId: 12,
      },
      true,
    );
    expect(mockWindow.location.hash).toContain("market=5");
    expect(mockWindow.location.hash).toContain("store=12");
    expect(mockWindow.history.state).toEqual({ mirinaeMarketDetail: true });
  });

  it("매장 내부 상품 상세 진입 시 매장 문맥과 상품 상세를 함께 보존한다", () => {
    writeMarketLocation(
      {
        marketId: 5,
        tab: "stores",
        query: "",
        page: 0,
        storeId: 12,
        storeOfferPage: 2,
        offerId: 101,
      },
      true,
    );
    expect(mockWindow.location.hash).toContain("market=5");
    expect(mockWindow.location.hash).toContain("store=12");
    expect(mockWindow.location.hash).toContain("storeOfferPage=2");
    expect(mockWindow.location.hash).toContain("offer=101");

    const loc = readMarketLocation(mockWindow.location.hash);
    expect(loc.marketId).toBe(5);
    expect(loc.storeId).toBe(12);
    expect(loc.storeOfferPage).toBe(2);
    expect(loc.offerId).toBe(101);
  });

  it("leaveMarketLocation 호출 시 history를 초기화한다", () => {
    mockWindow.location.hash = "#market?market=1";
    leaveMarketLocation();
    expect(mockWindow.history.replaceState).toHaveBeenCalledWith(null, "", "/");
  });
});
