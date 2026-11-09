import { useEffect, useMemo, useState } from "react";
import type { Coordinates } from "../../api/mapSdk";
import type { LocatedMarketView, MapBounds } from "../../api/types";
import { BuyerMarketMap } from "./BuyerMarketMap";
import { Pagination } from "./Pagination";

const pageSize = 10;
const marketNames = new Intl.Collator("ko", { numeric: true });

export function BuyerMarketPicker({
  markets,
  loading,
  hasError,
  active,
  nearby,
  mapSearchActive,
  onSearchMap,
  userCoords,
  onOpenMarket,
}: {
  markets: LocatedMarketView[];
  loading: boolean;
  hasError: boolean;
  active: boolean;
  nearby: boolean;
  mapSearchActive: boolean;
  onSearchMap: (bounds: MapBounds) => Promise<boolean>;
  userCoords: Coordinates | null;
  onOpenMarket: (id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [mapMarketId, setMapMarketId] = useState<number | null>(null);
  const sorted = useMemo(
    () =>
      [...markets].sort(
        (a, b) =>
          (nearby ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0) ||
          marketNames.compare(a.name, b.name) ||
          marketNames.compare(a.regionLabel ?? "", b.regionLabel ?? "") ||
          a.id - b.id,
      ),
    [markets, nearby],
  );
  useEffect(() => {
    setPage(0);
    setMapMarketId(null);
  }, [markets, nearby]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(sorted.length / pageSize) - 1));
  const visible = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const pageMarketIds = visible.map((market) => market.id).join(",");
  const [mapGeneration, setMapGeneration] = useState(0);
  useEffect(() => {
    if (!mapSearchActive) setMapGeneration((value) => value + 1);
  }, [pageMarketIds, nearby, mapSearchActive]);
  const mapMarket = visible.find((market) => market.id === mapMarketId);

  return (
    <div className="buyer-market-picker" data-map-open={active}>
      <div className="buyer-market-results">
        <div className="market-results-heading">
          <p className="market-results-summary" role="status">
            검색 결과 {markets.length.toLocaleString()}개 · {nearby ? "가까운 순" : "가나다순"} ·
            페이지당 {pageSize}개
          </p>
          {mapSearchActive && (
            <span
              className="market-map-scope"
              id="buyerLocationNotice"
              role="status"
              aria-label="지도에 보이는 범위의 등록 시장"
            >
              지도 범위
            </span>
          )}
          <span className="market-policy-note">판매점 등록 시장만 제공</span>
        </div>

        <ul className="market-result-list" id="marketResults">
          {visible.map((market) => (
            <li key={market.id} className="market-result-row">
              <button
                type="button"
                className="market-result-label"
                data-market-id={market.id}
                disabled={loading}
                aria-label={`${market.name} (${market.regionLabel || "위치 미등록"})${market.distanceKm != null ? ` · ${market.distanceKm.toFixed(1)}km` : ""}`}
                onClick={() => onOpenMarket(market.id)}
              >
                <span className="market-result-info">
                  <strong>{market.name}</strong>
                  <span>{market.regionLabel || "위치 미등록"}</span>
                  {market.address && <span>{market.address}</span>}
                </span>
                {market.distanceKm != null && (
                  <span className="market-result-distance">{market.distanceKm.toFixed(1)}km</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {markets.length === 0 && !loading && !hasError && (
          <div className="market-empty" role="status">
            <h2 id="buyerMarketEmpty">조건에 맞는 시장이 없습니다</h2>
            <p>시도·시군구를 변경하거나 다른 시장명을 검색해 보세요.</p>
          </div>
        )}

        {markets.length > pageSize && (
          <Pagination
            page={currentPage}
            size={pageSize}
            totalItems={markets.length}
            disabled={loading}
            onPage={setPage}
            label="시장 검색 결과 페이지"
          />
        )}
      </div>
      {active && (
        <div className="buyer-market-map-pane">
          <p className="buyer-map-heading">시장 위치</p>
          <BuyerMarketMap
            key={mapGeneration}
            selectedMarket={mapMarket ?? null}
            onOpenMarket={onOpenMarket}
            loading={loading}
            onSearchMap={onSearchMap}
            markets={visible}
            selectedMarketId={mapMarket?.id ?? null}
            userCoords={userCoords}
            onSelectMarket={setMapMarketId}
          />
        </div>
      )}
    </div>
  );
}
