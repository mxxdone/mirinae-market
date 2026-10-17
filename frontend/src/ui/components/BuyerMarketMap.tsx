import { useEffect, useRef, useState } from "react";
import { mountBuyerOverviewMap, type BuyerMapController, type Coordinates } from "../../api/mapSdk";
import type { LocatedMarketView } from "../../api/types";

interface Props {
  markets: LocatedMarketView[];
  selectedMarketId: number | null;
  userCoords?: Coordinates | null;
  onSelectMarket: (marketId: number) => void;
}

export function BuyerMarketMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<BuyerMapController | null>(null);
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);

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
          <div
            id="buyerOverviewMap"
            ref={containerRef}
            className="buyer-map-canvas"
            style={{
              minHeight: "280px",
              width: "100%",
              borderRadius: "8px",
              background: "#f0ede6",
            }}
          />
          {locatedMarkets.length > 0 && (
            <p className="map-caption">
              지도의 마커를 클릭하면 해당 시장을 바로 선택할 수 있습니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
