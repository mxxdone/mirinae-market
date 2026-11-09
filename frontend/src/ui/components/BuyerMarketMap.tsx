import { useEffect, useRef, useState } from "react";
import { mountBuyerOverviewMap, type BuyerMapController, type Coordinates } from "../../api/mapSdk";
import type { LocatedMarketView, MapBounds } from "../../api/types";

interface Props {
  markets: LocatedMarketView[];
  selectedMarketId: number | null;
  selectedMarket: LocatedMarketView | null;
  loading: boolean;
  onOpenMarket: (id: number) => void;
  userCoords?: Coordinates | null;
  onSelectMarket: (marketId: number) => void;
  onSearchMap: (bounds: MapBounds) => Promise<boolean>;
}

export function BuyerMarketMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BuyerMapController | null>(null);
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searchBounds, setSearchBounds] = useState<MapBounds | null>(null);
  const [searching, setSearching] = useState(false);
  const viewportRevision = useRef(0);
  const onSearchMapRef = useRef(props.onSearchMap);
  useEffect(() => {
    onSearchMapRef.current = props.onSearchMap;
  }, [props.onSearchMap]);

  async function searchMap() {
    if (!searchBounds || searching) return;
    const revision = viewportRevision.current;
    setSearching(true);
    try {
      const success = await onSearchMapRef.current(searchBounds);
      if (success && revision === viewportRevision.current) setSearchBounds(null);
    } finally {
      setSearching(false);
    }
  }

  const locatedMarkets = props.markets.filter((m) => m.latitude != null && m.longitude != null);

  const onSelectMarketRef = useRef(props.onSelectMarket);
  useEffect(() => {
    onSelectMarketRef.current = props.onSelectMarket;
  }, [props.onSelectMarket]);

  const latestPropsRef = useRef({
    markets: props.markets,
    selectedMarketId: props.selectedMarketId,
    userCoords: props.userCoords,
  });
  useEffect(() => {
    latestPropsRef.current = {
      markets: props.markets,
      selectedMarketId: props.selectedMarketId,
      userCoords: props.userCoords,
    };
  }, [props.markets, props.selectedMarketId, props.userCoords]);

  useEffect(() => {
    let active = true;
    const mapAbort = new AbortController();
    const container = containerRef.current;
    if (!container) return;

    setMapError("");
    const initial = latestPropsRef.current;

    void mountBuyerOverviewMap(
      container,
      {
        markets: initial.markets,
        selectedMarketId: initial.selectedMarketId,
        userCoords: initial.userCoords,
        onSelectMarket(marketId) {
          if (active) {
            onSelectMarketRef.current(marketId);
          }
        },
        onViewportChange(bounds) {
          if (active) {
            ++viewportRevision.current;
            setSearchBounds(bounds);
          }
        },
      },
      mapAbort.signal,
    )
      .then((controller) => {
        if (!active) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        const latest = latestPropsRef.current;
        controller.update(latest.markets, latest.selectedMarketId, latest.userCoords);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setMapError(
          err instanceof Error
            ? err.message
            : "지도를 불러오지 못했습니다. 목록에서 시장을 선택할 수 있습니다.",
        );
      });

    return () => {
      active = false;
      mapAbort.abort();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [attempt]);

  // 조회 결과나 선택이 바뀌면 표시점을 갱신합니다.
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.update(props.markets, props.selectedMarketId, props.userCoords);
    }
  }, [props.markets, props.selectedMarketId, props.userCoords]);

  return (
    <div className="buyer-market-map-section" aria-label="시장 지도 탐색">
      {mapError ? (
        <div className="map-fallback-notice" role="status">
          <p>{mapError}</p>
          <button
            type="button"
            onClick={() => {
              setMapError("");
              setAttempt((value) => value + 1);
            }}
          >
            지도 다시 불러오기
          </button>
          <p className="field-help-text">
            지도 서비스 장애 시에도 위의 시도·시군구 선택 및 시장 목록으로 원활하게 이용하실 수
            있습니다.
          </p>
        </div>
      ) : (
        <>
          <div className="buyer-map-frame">
            <div id="buyerOverviewMap" ref={containerRef} className="buyer-map-canvas" />
            {searchBounds && (
              <div className="buyer-map-search-overlay">
                <button
                  type="button"
                  className="buyer-map-search-button"
                  disabled={searching}
                  onClick={() => void searchMap()}
                >
                  {searching ? "찾는 중…" : "이 지도에서 시장 찾기"}
                </button>
              </div>
            )}
            {props.selectedMarket && (
              <div className="market-map-preview" role="region" aria-label="지도에서 고른 시장">
                <div className="market-map-preview-info">
                  <strong title={props.selectedMarket.name}>{props.selectedMarket.name}</strong>
                  <p
                    title={
                      props.selectedMarket.address ||
                      props.selectedMarket.regionLabel ||
                      "위치 미등록"
                    }
                  >
                    {props.selectedMarket.address ||
                      props.selectedMarket.regionLabel ||
                      "위치 미등록"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-query-store"
                  disabled={props.loading}
                  onClick={() => {
                    if (props.selectedMarket) props.onOpenMarket(props.selectedMarket.id);
                  }}
                >
                  상품 보기
                </button>
              </div>
            )}
          </div>
          {locatedMarkets.length > 0 && (
            <p className="map-caption sr-only">마커를 누르면 시장 정보를 확인할 수 있습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
