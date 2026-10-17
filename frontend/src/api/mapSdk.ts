import type { LocatedMarketView } from "./types";

/**
 * 네이버 지도 Web SDK 캡슐화 래퍼
 *
 * 규칙:
 * 1. UI 컴포넌트는 window.naver, 외부 스크립트 로드, 직접 fetch를 수행하지 않습니다.
 * 2. VITE_NAVER_MAP_CLIENT_ID 환경 변수를 사용하며 키나 요청 URL을 로그에 출력하지 않습니다.
 * 3. 지점 이동 시 이전 참고 주소 조회 요청은 AbortSignal로 취소하거나 stale 폐기합니다.
 * 4. 지도 로딩 실패/미설정 시에도 UI는 일반 좌표/주소로 정상 동작합니다.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeResult {
  address: string;
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResult {
  address: string;
}

export interface AdminMapPickerOptions {
  initialCoords?: Coordinates | null;
  onCoordsChange: (coords: Coordinates) => void;
}

export interface AdminMapController {
  setPosition(coords: Coordinates): void;
  destroy(): void;
}

export interface BuyerMapOverviewOptions {
  markets: LocatedMarketView[];
  selectedMarketId: number | null;
  userCoords?: Coordinates | null;
  onSelectMarket: (marketId: number) => void;
}

export interface BuyerMapController {
  update(
    markets: LocatedMarketView[],
    selectedMarketId: number | null,
    userCoords?: Coordinates | null,
  ): void;
  destroy(): void;
}

export interface MapSdkProvider {
  loadSdk(): Promise<void>;
  geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult>;
  reverseGeocode(coords: Coordinates, signal?: AbortSignal): Promise<ReverseGeocodeResult>;
  mountAdminPicker(container: HTMLElement, options: AdminMapPickerOptions): AdminMapController;
  mountBuyerOverview(container: HTMLElement, options: BuyerMapOverviewOptions): BuyerMapController;
}

let customProvider: MapSdkProvider | null = null;

export function setMapSdkProvider(provider: MapSdkProvider | null): void {
  customProvider = provider;
}

// 여러 화면의 SDK 로딩 요청을 공유합니다.
let sdkLoadPromise: Promise<void> | null = null;
let scriptElement: HTMLScriptElement | null = null;

interface NaverLatLng {
  lat(): number;
  lng(): number;
}

interface NaverMapInstance {
  setCenter(latLng: unknown): void;
  panTo(latLng: unknown): void;
  destroy?(): void;
}

interface NaverMarkerInstance {
  setPosition(latLng: unknown): void;
  getPosition(): NaverLatLng;
  setMap(map: unknown): void;
  setTitle(title: string): void;
  setIcon?(icon: unknown): void;
}

interface NaverEventHandle {
  listener?: unknown;
}

interface NaverMapsGlobal {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => NaverMapInstance;
    Marker: new (options: Record<string, unknown>) => NaverMarkerInstance;
    LatLng: new (lat: number, lng: number) => NaverLatLng;
    Event: {
      addListener(
        target: unknown,
        eventName: string,
        handler: (event: { coord: NaverLatLng }) => void,
      ): NaverEventHandle;
      removeListener(handle: NaverEventHandle): void;
    };
    Service?: {
      Status: { OK: number | string };
      geocode(
        options: { query: string },
        callback: (status: number | string, response: Record<string, unknown>) => void,
      ): void;
      reverseGeocode(
        options: { coords: unknown; orders?: string },
        callback: (status: number | string, response: Record<string, unknown>) => void,
      ): void;
    };
  };
}

function getNaverMaps(): NaverMapsGlobal["maps"] | null {
  const globalObj =
    typeof window !== "undefined" ? (window as unknown as { naver?: NaverMapsGlobal }) : null;
  return globalObj?.naver?.maps ?? null;
}

let envClientIdOverride: string | null = null;

export function setMapClientIdForTesting(clientId: string | null): void {
  envClientIdOverride = clientId;
}

function getMapClientId(): string {
  if (envClientIdOverride !== null) {
    return envClientIdOverride;
  }
  const clientId = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_NAVER_MAP_CLIENT_ID;
  return typeof clientId === "string" ? clientId.trim() : "";
}

const defaultProvider: MapSdkProvider = {
  async loadSdk(): Promise<void> {
    const existing = getNaverMaps();
    if (existing?.Map && existing.Service) return;

    if (sdkLoadPromise) return sdkLoadPromise;

    const clientId = getMapClientId();
    if (!clientId) {
      throw new Error("네이버 지도 Client ID가 설정되지 않았습니다.");
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("브라우저 환경에서만 지도를 로드할 수 있습니다.");
    }

    sdkLoadPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const callbackName = "mirinaeNaverMapsReady";
      const callbacks = window as unknown as Record<string, unknown>;
      callbacks[callbackName] = () => {
        if (settled) return;
        if (!getNaverMaps()?.Service) return;
        settled = true;
        clearTimeout(timeoutId);
        delete callbacks[callbackName];
        delete callbacks.navermap_authFailure;
        resolve();
      };

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("네이버 지도 SDK 로딩 시간이 초과되었습니다."));
      }, 10000);

      function cleanup() {
        clearTimeout(timeoutId);
        delete callbacks[callbackName];
        delete callbacks.navermap_authFailure;
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
          scriptElement = null;
        }
        sdkLoadPromise = null;
      }

      // 네이버 인증 실패 콜백 등록
      (window as unknown as { navermap_authFailure?: () => void }).navermap_authFailure = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("네이버 지도 클라이언트 인증에 실패했습니다."));
      };

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(
        clientId.trim(),
      )}&submodules=geocoder&callback=${callbackName}`;
      script.async = true;

      // 메인 스크립트의 onload보다 늦게 준비되는 geocoder까지 콜백으로 기다립니다.
      script.onload = () => {};

      script.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("네이버 지도 SDK를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요."));
      };

      scriptElement = script;
      document.head.appendChild(script);
    });

    return sdkLoadPromise;
  },

  async geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult> {
    await this.loadSdk();
    if (signal?.aborted) {
      throw new Error("요청이 취소되었습니다.");
    }

    const maps = getNaverMaps();
    if (!maps?.Service) {
      throw new Error("네이버 지도 지오코더 모듈을 사용할 수 없습니다.");
    }

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("요청이 취소되었습니다."));
        return;
      }

      let settled = false;
      const onAbort = () => {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error("요청이 취소되었습니다."));
      };
      const timeoutId = setTimeout(() => {
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        reject(new Error("주소 조회 시간이 초과되었습니다. 다시 시도해 주세요."));
      }, 10000);
      signal?.addEventListener("abort", onAbort, { once: true });

      maps.Service!.geocode({ query }, (status, response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) return;

        const isOk = status === 200 || status === maps.Service!.Status.OK;
        const resp = response as {
          v2?: {
            addresses?: Array<{
              roadAddress?: string;
              jibunAddress?: string;
              x: string;
              y: string;
            }>;
          };
        };

        const addresses = resp.v2?.addresses;
        if (!isOk || !addresses || addresses.length === 0) {
          reject(new Error("해당 주소의 위치를 찾지 못했습니다."));
          return;
        }

        const first = addresses[0];
        if (!first) {
          reject(new Error("해당 주소의 위치를 찾지 못했습니다."));
          return;
        }

        const latitude = parseFloat(first.y);
        const longitude = parseFloat(first.x);
        const address = first.roadAddress || first.jibunAddress || query;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          reject(new Error("주소 좌표 정보가 올바르지 않습니다."));
          return;
        }

        resolve({ address, latitude, longitude });
      });
    });
  },

  async reverseGeocode(coords: Coordinates, signal?: AbortSignal): Promise<ReverseGeocodeResult> {
    await this.loadSdk();
    if (signal?.aborted) {
      throw new Error("요청이 취소되었습니다.");
    }

    const maps = getNaverMaps();
    if (!maps?.Service) {
      throw new Error("네이버 지도 지오코더 모듈을 사용할 수 없습니다.");
    }

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("요청이 취소되었습니다."));
        return;
      }

      let settled = false;
      const onAbort = () => {
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error("요청이 취소되었습니다."));
      };
      const timeoutId = setTimeout(() => {
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        reject(new Error("주소 조회 시간이 초과되었습니다. 다시 시도해 주세요."));
      }, 10000);
      signal?.addEventListener("abort", onAbort, { once: true });

      const latLng = new maps.LatLng(coords.latitude, coords.longitude);
      maps.Service!.reverseGeocode(
        { coords: latLng, orders: "roadaddr,addr" },
        (status, response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onAbort);
          if (signal?.aborted) return;

          const isOk = status === 200 || status === maps.Service!.Status.OK;
          const resp = response as {
            v2?: {
              address?: {
                roadAddress?: string;
                jibunAddress?: string;
              };
              results?: Array<{
                name?: string;
                region?: {
                  area1?: { name?: string };
                  area2?: { name?: string };
                  area3?: { name?: string };
                  area4?: { name?: string };
                };
                land?: {
                  number1?: string;
                  number2?: string;
                  name?: string;
                };
              }>;
            };
          };

          if (!isOk) {
            reject(new Error("참고 주소를 조회하지 못했습니다."));
            return;
          }

          const road = resp.v2?.address?.roadAddress;
          const jibun = resp.v2?.address?.jibunAddress;
          if (road && road.trim().length > 0) {
            resolve({ address: road.trim() });
            return;
          }
          if (jibun && jibun.trim().length > 0) {
            resolve({ address: jibun.trim() });
            return;
          }

          const results = resp.v2?.results;
          if (results && results.length > 0) {
            const first = results[0];
            if (first) {
              const area1 = first.region?.area1?.name ?? "";
              const area2 = first.region?.area2?.name ?? "";
              const area3 = first.region?.area3?.name ?? "";
              const land = first.land?.name ?? "";
              const text = [area1, area2, area3, land].filter(Boolean).join(" ").trim();
              if (text.length > 0) {
                resolve({ address: text });
                return;
              }
            }
          }

          reject(new Error("해당 좌표의 참고 주소가 없습니다."));
        },
      );
    });
  },

  mountAdminPicker(container: HTMLElement, options: AdminMapPickerOptions): AdminMapController {
    const maps = getNaverMaps();
    if (!maps) {
      throw new Error("네이버 지도 SDK가 로드되지 않았습니다.");
    }

    const initialLat = options.initialCoords?.latitude ?? 37.5665;
    const initialLng = options.initialCoords?.longitude ?? 126.978;

    const map = new maps.Map(container, {
      center: new maps.LatLng(initialLat, initialLng),
      zoom: 15,
      zoomControl: true,
    });

    const marker = new maps.Marker({
      position: new maps.LatLng(initialLat, initialLng),
      map,
      draggable: true,
      title: "시장 대표 위치",
    });

    const dragListener = maps.Event.addListener(marker, "dragend", () => {
      const pos = marker.getPosition();
      options.onCoordsChange({
        latitude: pos.lat(),
        longitude: pos.lng(),
      });
    });

    const clickListener = maps.Event.addListener(map, "click", (e) => {
      const coord = e.coord;
      marker.setPosition(coord);
      options.onCoordsChange({
        latitude: coord.lat(),
        longitude: coord.lng(),
      });
    });

    return {
      setPosition(coords: Coordinates) {
        const latLng = new maps.LatLng(coords.latitude, coords.longitude);
        marker.setPosition(latLng);
        map.panTo(latLng);
      },
      destroy() {
        maps.Event.removeListener(dragListener);
        maps.Event.removeListener(clickListener);
        marker.setMap(null);
        if (typeof map.destroy === "function") {
          map.destroy();
        }
        container.innerHTML = "";
      },
    };
  },

  mountBuyerOverview(container: HTMLElement, options: BuyerMapOverviewOptions): BuyerMapController {
    const maps = getNaverMaps();
    if (!maps) {
      throw new Error("네이버 지도 SDK가 로드되지 않았습니다.");
    }

    const defaultLat = 37.5665;
    const defaultLng = 126.978;
    const initialCenter = options.userCoords
      ? new maps.LatLng(options.userCoords.latitude, options.userCoords.longitude)
      : options.markets.find((m) => m.latitude && m.longitude)
        ? new maps.LatLng(
            options.markets.find((m) => m.latitude && m.longitude)!.latitude!,
            options.markets.find((m) => m.latitude && m.longitude)!.longitude!,
          )
        : new maps.LatLng(defaultLat, defaultLng);

    const map = new maps.Map(container, {
      center: initialCenter,
      zoom: 13,
      zoomControl: true,
    });

    let marketMarkers: Array<{
      id: number;
      marker: NaverMarkerInstance;
      handle: NaverEventHandle;
    }> = [];
    let userMarker: NaverMarkerInstance | null = null;

    function renderMarkers(
      currentMarkets: LocatedMarketView[],
      currentSelectedId: number | null,
      currentUserCoords?: Coordinates | null,
    ) {
      // 기존 표시점과 이벤트를 정리합니다.
      for (const item of marketMarkers) {
        maps!.Event.removeListener(item.handle);
        item.marker.setMap(null);
      }
      marketMarkers = [];

      if (userMarker) {
        userMarker.setMap(null);
        userMarker = null;
      }

      // 현재 위치가 있을 때만 표시합니다.
      if (currentUserCoords) {
        userMarker = new maps!.Marker({
          position: new maps!.LatLng(currentUserCoords.latitude, currentUserCoords.longitude),
          map,
          title: "내 위치",
        });
      }

      // 좌표가 있는 시장을 표시합니다.
      for (const m of currentMarkets) {
        if (m.latitude == null || m.longitude == null) continue;
        const isSelected = m.id === currentSelectedId;
        const marker = new maps!.Marker({
          position: new maps!.LatLng(m.latitude, m.longitude),
          map,
          title: m.name,
        });

        const handle = maps!.Event.addListener(marker, "click", () => {
          options.onSelectMarket(m.id);
        });

        marketMarkers.push({ id: m.id, marker, handle });

        if (isSelected) {
          map.panTo(new maps!.LatLng(m.latitude, m.longitude));
        }
      }
    }

    renderMarkers(options.markets, options.selectedMarketId, options.userCoords);

    return {
      update(markets, selectedMarketId, userCoords) {
        renderMarkers(markets, selectedMarketId, userCoords);
      },
      destroy() {
        for (const item of marketMarkers) {
          maps!.Event.removeListener(item.handle);
          item.marker.setMap(null);
        }
        marketMarkers = [];
        if (userMarker) {
          userMarker.setMap(null);
          userMarker = null;
        }
        if (typeof map.destroy === "function") {
          map.destroy();
        }
        container.innerHTML = "";
      },
    };
  },
};

function getProvider(): MapSdkProvider {
  return customProvider ?? defaultProvider;
}

export function loadMapSdk(): Promise<void> {
  return getProvider().loadSdk();
}

export function geocodeAddress(query: string, signal?: AbortSignal): Promise<GeocodeResult> {
  return getProvider().geocode(query, signal);
}

export function reverseGeocodeCoords(
  coords: Coordinates,
  signal?: AbortSignal,
): Promise<ReverseGeocodeResult> {
  return getProvider().reverseGeocode(coords, signal);
}

export function mountAdminPickerMap(
  container: HTMLElement,
  options: AdminMapPickerOptions,
  signal?: AbortSignal,
): Promise<AdminMapController> {
  return getProvider()
    .loadSdk()
    .then(() => {
      if (signal?.aborted) throw new Error("지도 표시 요청이 취소되었습니다.");
      return getProvider().mountAdminPicker(container, options);
    });
}

export function mountBuyerOverviewMap(
  container: HTMLElement,
  options: BuyerMapOverviewOptions,
  signal?: AbortSignal,
): Promise<BuyerMapController> {
  return getProvider()
    .loadSdk()
    .then(() => {
      if (signal?.aborted) throw new Error("지도 표시 요청이 취소되었습니다.");
      return getProvider().mountBuyerOverview(container, options);
    });
}
