import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  geocodeAddress,
  loadMapSdk,
  mountAdminPickerMap,
  mountBuyerOverviewMap,
  reverseGeocodeCoords,
  setMapClientIdForTesting,
  setMapSdkProvider,
  type AdminMapController,
  type AdminMapPickerOptions,
  type BuyerMapController,
  type BuyerMapOverviewOptions,
  type Coordinates,
  type GeocodeResult,
  type MapSdkProvider,
  type ReverseGeocodeResult,
} from "./mapSdk";
import type { LocatedMarketView } from "./types";

describe("mapSdk", () => {
  afterEach(() => {
    setMapSdkProvider(null);
    setMapClientIdForTesting(null);
    vi.restoreAllMocks();
  });

  describe("기본 프로바이더 설정 검증", () => {
    it("Client ID 환경변수가 없으면 loadSdk가 실패한다", async () => {
      setMapClientIdForTesting("");
      await expect(loadMapSdk()).rejects.toThrow("네이버 지도 Client ID가 설정되지 않았습니다.");
    });

    it("브라우저 환경이 아니면 loadSdk가 에러를 던진다", async () => {
      setMapClientIdForTesting("test-client-id");
      await expect(loadMapSdk()).rejects.toThrow("브라우저 환경에서만 지도를 로드할 수 있습니다.");
    });
  });

  describe("모의 프로바이더(Mock Map Provider) 검증", () => {
    let mockProvider: MapSdkProvider;
    let geocodeFn: ReturnType<typeof vi.fn>;
    let reverseGeocodeFn: ReturnType<typeof vi.fn>;
    let mountAdminPickerFn: ReturnType<typeof vi.fn>;
    let mountBuyerOverviewFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      geocodeFn = vi.fn();
      reverseGeocodeFn = vi.fn();
      mountAdminPickerFn = vi.fn();
      mountBuyerOverviewFn = vi.fn();

      mockProvider = {
        loadSdk: vi.fn().mockResolvedValue(undefined),
        geocode: geocodeFn,
        reverseGeocode: reverseGeocodeFn,
        mountAdminPicker: mountAdminPickerFn,
        mountBuyerOverview: mountBuyerOverviewFn,
      };

      setMapSdkProvider(mockProvider);
    });

    it("주소 지오코딩 성공 시 정상 좌표를 반환한다", async () => {
      const expected: GeocodeResult = {
        address: "서울특별시 종로구 창경궁로 88",
        latitude: 37.57,
        longitude: 126.999,
      };
      geocodeFn.mockResolvedValue(expected);

      const result = await geocodeAddress("창경궁로 88");
      expect(result).toEqual(expected);
      expect(geocodeFn).toHaveBeenCalledWith("창경궁로 88", undefined);
    });

    it("주소 검색 결과가 없으면 에러를 던진다", async () => {
      geocodeFn.mockRejectedValue(new Error("해당 주소의 위치를 찾지 못했습니다."));

      await expect(geocodeAddress("존재하지않는주소12345")).rejects.toThrow(
        "해당 주소의 위치를 찾지 못했습니다.",
      );
    });

    it("좌표 역지오코딩 성공 시 참고 주소를 반환한다", async () => {
      const expected: ReverseGeocodeResult = {
        address: "서울특별시 종로구 예지동",
      };
      reverseGeocodeFn.mockResolvedValue(expected);

      const coords: Coordinates = { latitude: 37.57, longitude: 126.999 };
      const result = await reverseGeocodeCoords(coords);
      expect(result).toEqual(expected);
      expect(reverseGeocodeFn).toHaveBeenCalledWith(coords, undefined);
    });

    it("역지오코딩 실패 시 에러를 던진다", async () => {
      reverseGeocodeFn.mockRejectedValue(new Error("참고 주소를 조회하지 못했습니다."));

      const coords: Coordinates = { latitude: 37.57, longitude: 126.999 };
      await expect(reverseGeocodeCoords(coords)).rejects.toThrow(
        "참고 주소를 조회하지 못했습니다.",
      );
    });

    it("지점 연속 이동 시 이전 참고 주소 요청을 취소하고 최신 응답만 채택한다 (경쟁 응답/Stale 방지)", async () => {
      // 1번 요청: 느린 응답
      // 2번 요청: 빠른 응답
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const firstPromise = new Promise<ReverseGeocodeResult>((_resolve, reject) => {
        controller1.signal.addEventListener("abort", () => {
          reject(new Error("요청이 취소되었습니다."));
        });
      });

      const secondPromise = Promise.resolve({ address: "두번째 최신 주소" });

      reverseGeocodeFn
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => secondPromise);

      // 위치 1로 이동
      const coords1: Coordinates = { latitude: 37.1, longitude: 127.1 };
      const req1 = reverseGeocodeCoords(coords1, controller1.signal);

      // 위치 1 응답 전에 위치 2로 즉시 이동 -> 1번 요청 취소
      controller1.abort();
      const coords2: Coordinates = { latitude: 37.2, longitude: 127.2 };
      const req2 = reverseGeocodeCoords(coords2, controller2.signal);

      // 2번 결과는 성공
      const res2 = await req2;
      expect(res2.address).toBe("두번째 최신 주소");

      // 1번 결과는 취소됨
      await expect(req1).rejects.toThrow("요청이 취소되었습니다.");
    });

    it("관리자 위치 피커 맵 마운트 및 위치 변경 콜백을 검증한다", async () => {
      const container = {} as HTMLElement;
      let storedCoordsChange: ((coords: Coordinates) => void) | null = null;

      const mockController: AdminMapController = {
        setPosition: vi.fn(),
        destroy: vi.fn(),
      };

      mountAdminPickerFn.mockImplementation((_c, options: AdminMapPickerOptions) => {
        storedCoordsChange = options.onCoordsChange;
        return mockController;
      });

      const onCoordsChange = vi.fn();
      const controller = await mountAdminPickerMap(container, {
        initialCoords: { latitude: 37.5, longitude: 127.0 },
        onCoordsChange,
      });

      expect(mountAdminPickerFn).toHaveBeenCalled();
      expect(controller).toBe(mockController);

      // 마커 드래그 시뮬레이션
      storedCoordsChange!({ latitude: 37.55, longitude: 127.05 });
      expect(onCoordsChange).toHaveBeenCalledWith({ latitude: 37.55, longitude: 127.05 });

      // controller setPosition 및 destroy 호출
      controller.setPosition({ latitude: 37.6, longitude: 127.1 });
      expect(mockController.setPosition).toHaveBeenCalledWith({ latitude: 37.6, longitude: 127.1 });

      controller.destroy();
      expect(mockController.destroy).toHaveBeenCalled();
    });

    it("구매자 오버뷰 맵 마운트 및 마커 클릭 연동을 검증한다", async () => {
      const container = {} as HTMLElement;
      let storedSelectMarket: ((id: number) => void) | null = null;

      const mockController: BuyerMapController = {
        update: vi.fn(),
        destroy: vi.fn(),
      };

      mountBuyerOverviewFn.mockImplementation((_c, options: BuyerMapOverviewOptions) => {
        storedSelectMarket = options.onSelectMarket;
        return mockController;
      });

      const markets: LocatedMarketView[] = [
        {
          id: 1,
          name: "중앙시장",
          regionCode: "11110",
          provinceCode: "11",
          regionLabel: "서울 종로구",
          address: "서울 종로구",
          latitude: 37.57,
          longitude: 126.99,
          distanceKm: 1.2,
        },
      ];

      const onSelectMarket = vi.fn();
      const controller = await mountBuyerOverviewMap(container, {
        markets,
        selectedMarketId: null,
        onSelectMarket,
      });

      expect(mountBuyerOverviewFn).toHaveBeenCalled();
      expect(controller).toBe(mockController);

      // 시장 마커 클릭 시뮬레이션
      storedSelectMarket!(1);
      expect(onSelectMarket).toHaveBeenCalledWith(1);

      controller.update(markets, 1, { latitude: 37.56, longitude: 126.98 });
      expect(mockController.update).toHaveBeenCalledWith(markets, 1, {
        latitude: 37.56,
        longitude: 126.98,
      });

      controller.destroy();
      expect(mockController.destroy).toHaveBeenCalled();
    });
  });
});
