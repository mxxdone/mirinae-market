import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Coordinates } from "../../api/mapSdk";
import type { LocatedMarketView, OfferView, RegionView } from "../../api/types";
import { BuyerMarketMap } from "../components/BuyerMarketMap";
import { OfferCard } from "../components/OfferCard";
import { Pagination } from "../components/Pagination";
import { StatusAlert } from "../components/StatusAlert";

interface Props {
  onCheckout: () => void;
  onOrders: () => void;
  onAdd: (offer: OfferView) => void;
  adding: boolean;
  markets: LocatedMarketView[];
  offers: OfferView[];
  selected: OfferView | null;
  marketId: number | null;
  loading: boolean;
  error: string | null;
  page: number;
  totalItems: number;
  date: string;
  searchQuery: string;
  onSearch: (marketId: number, query: string) => void;
  onPage: (page: number) => void;
  onOpen: (offer: OfferView) => void;
  onBack: () => void;
  onAccount: () => void;
  onRetry: () => void;

  // 지역·위치 선택 입력
  regions: RegionView[];
  selectedProvince: string;
  selectedDistrict: string;
  onProvinceChange: (code: string) => void;
  onDistrictChange: (code: string) => void;
  marketNameQuery: string;
  onMarketNameQueryChange: (query: string) => void;
  onSearchMarketName: () => void;
  onNearbyClick: () => void;
  nearbyActive: boolean;
  userCoords: Coordinates | null;
  locationNotice: string | null;
  locationError: string | null;
  onSelectMarket: (marketId: number) => void;
}

export function BuyerMarketScreen(props: Props) {
  const [productQuery, setProductQuery] = useState("");
  const [showMap, setShowMap] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setProductQuery(props.searchQuery);
  }, [props.searchQuery]);

  useEffect(() => {
    if (props.selected) heading.current?.focus();
  }, [props.selected]);

  function submitProductSearch(event: FormEvent) {
    event.preventDefault();
    if (props.marketId !== null) props.onSearch(props.marketId, productQuery);
  }

  function submitMarketNameSearch(event: FormEvent) {
    event.preventDefault();
    props.onSearchMarketName();
  }

  // 시도 목록은 중복 없이 표시합니다.
  const provinces = Array.from(
    new Map(
      props.regions.map((r) => [r.provinceCode, { code: r.provinceCode, name: r.provinceName }]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  // 선택한 시도에 속하는 시군구만 표시합니다.
  const districts = props.regions.filter((r) => r.provinceCode === props.selectedProvince);

  return (
    <section className="hybrid-card market-workspace" aria-labelledby="heading-market">
      <header className="summary-card-header market-header">
        <div className="summary-tag-row">
          <span className="pill-badge primary">오늘의 장보기</span>
          <button className="text-action-link" type="button" onClick={props.onCheckout}>
            장바구니
          </button>
          <button className="text-action-link" type="button" onClick={props.onOrders}>
            주문 내역
          </button>
          <button className="text-action-link" type="button" onClick={props.onAccount}>
            내 계정
          </button>
        </div>
        <h1 id="heading-market" className="summary-heading">
          우리 시장, 오늘의 좋은 먹거리
        </h1>
        <p className="summary-subtext">
          {props.date} 방문 수령 · 포장 구성과 매장별 가격을 살펴보세요.
        </p>
      </header>

      <div className="summary-card-body market-body">
        {/* 서비스 정책 안내 */}
        <p className="market-policy-banner">판매점(점포)이 등록된 시장만 제공됩니다.</p>

        {/* 1. 지역별 선택 및 내 주변 필터 영역 */}
        <div className="market-filter-panel" aria-label="지역 및 위치 필터">
          <div className="filter-controls-row">
            {/* 시도 선택 */}
            <div className="field-group">
              <label className="field-label" htmlFor="buyerSelectProvince">
                시도 선택
              </label>
              <select
                className="input-box"
                id="buyerSelectProvince"
                value={props.selectedProvince}
                onChange={(e) => props.onProvinceChange(e.target.value)}
              >
                <option value="">전체 시도</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 시군구 선택 */}
            <div className="field-group">
              <label className="field-label" htmlFor="buyerSelectDistrict">
                시군구 선택
              </label>
              <select
                className="input-box"
                id="buyerSelectDistrict"
                value={props.selectedDistrict}
                onChange={(e) => props.onDistrictChange(e.target.value)}
                disabled={!props.selectedProvince || districts.length === 0}
              >
                <option value="">전체 시군구</option>
                {districts.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.districtName}
                  </option>
                ))}
              </select>
            </div>

            {/* 시장명 검색 */}
            <form className="field-group market-name-search-form" onSubmit={submitMarketNameSearch}>
              <label className="field-label" htmlFor="buyerInputMarketName">
                시장명 검색
              </label>
              <div className="input-with-button">
                <input
                  className="input-box"
                  id="buyerInputMarketName"
                  value={props.marketNameQuery}
                  onChange={(e) => props.onMarketNameQueryChange(e.target.value)}
                  placeholder="예: 광장시장, 자갈치"
                  maxLength={100}
                />
                <button type="submit" id="btnSearchMarketName" className="btn-secondary-sm">
                  검색
                </button>
              </div>
            </form>

            {/* 내 주변 버튼 */}
            <div className="field-group location-action-group">
              <span className="field-label">&nbsp;</span>
              <button
                type="button"
                id="btnNearbyMarkets"
                className={`btn-nearby-location ${props.nearbyActive ? "active" : ""}`}
                onClick={props.onNearbyClick}
              >
                내 주변 (10km)
              </button>
            </div>

            {/* 지도 토글 버튼 */}
            <div className="field-group location-action-group">
              <span className="field-label">&nbsp;</span>
              <button
                type="button"
                id="btnToggleBuyerMap"
                className="btn-secondary-sm"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? "지도 접기" : "지도 보기"}
              </button>
            </div>
          </div>

          {/* 위치 관련 안내 또는 오류 메시지 */}
          {props.locationError && (
            <p role="alert" className="error-text" id="buyerLocationError">
              {props.locationError}
            </p>
          )}
          {props.locationNotice && (
            <p role="status" className="notice-text" id="buyerLocationNotice">
              {props.locationNotice}
            </p>
          )}

          {/* 지도 영역 */}
          {showMap && (
            <BuyerMarketMap
              markets={props.markets}
              selectedMarketId={props.marketId}
              userCoords={props.userCoords}
              onSelectMarket={props.onSelectMarket}
            />
          )}
        </div>

        {/* 2. 시장 선택 및 상품 검색 폼 */}
        <form className="market-search-bar" onSubmit={submitProductSearch}>
          <div className="field-group">
            <label className="field-label" htmlFor="marketSelect">
              시장 선택
            </label>
            <select
              className="input-box"
              id="marketSelect"
              value={props.marketId ?? ""}
              onChange={(event) => {
                setProductQuery("");
                props.onSelectMarket(Number(event.target.value));
              }}
              disabled={props.markets.length === 0}
            >
              <option value="" disabled>
                시장을 선택해 주세요
              </option>
              {props.markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.name} ({market.regionLabel || "위치 미등록"})
                  {market.distanceKm != null ? ` · ${market.distanceKm.toFixed(1)}km` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group search-query">
            <label className="field-label" htmlFor="productSearch">
              찾는 상품
            </label>
            <input
              className="input-box"
              id="productSearch"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              maxLength={100}
              placeholder="양파, 사과, 새우…"
            />
          </div>
          <button
            className="btn-query-store"
            disabled={props.loading || props.marketId === null}
            type="submit"
          >
            상품 검색
          </button>
        </form>

        <StatusAlert message={props.error} onRetry={props.onRetry} />

        {props.loading ? (
          <p role="status" className="market-empty">
            시장 상품을 불러오고 있습니다.
          </p>
        ) : props.selected ? (
          <div className="offer-detail">
            <button className="text-action-link" type="button" onClick={props.onBack}>
              ← 상품 목록으로
            </button>
            <p className="offer-store-name">{props.selected.storeName}</p>
            <h2 ref={heading} tabIndex={-1}>
              {props.selected.productName}
            </h2>
            <p className="offer-price">
              {props.selected.priceWon.toLocaleString()}
              <span>원 / 포장</span>
            </p>
            <p className="comparison-price">
              {props.selected.comparisonUnit}당{" "}
              {props.selected.comparisonPriceWon.toLocaleString("ko-KR", {
                minimumFractionDigits: 2,
              })}
              원
            </p>
            <dl className="offer-facts">
              <div>
                <dt>주문 마감</dt>
                <dd>{props.selected.orderDeadline.slice(0, 5)}</dd>
              </div>
              <div>
                <dt>한 포장 구성</dt>
                <dd>
                  {props.selected.unitAmount.toLocaleString()}
                  {props.selected.unitType === "WEIGHT" ? "g" : "개"}
                </dd>
              </div>
              <div>
                <dt>수령일</dt>
                <dd>{props.selected.pickupDate}</dd>
              </div>
              <div>
                <dt>수령 시간</dt>
                <dd>
                  {props.selected.startTime.slice(0, 5)}~{props.selected.endTime.slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt>온라인 판매 수량</dt>
                <dd>
                  {props.selected.onlineQuantity === 0
                    ? "품절"
                    : `${props.selected.onlineQuantity.toLocaleString()}포장`}
                </dd>
              </div>
            </dl>
            <button
              className="btn-query-store"
              disabled={props.adding || props.selected.onlineQuantity === 0}
              onClick={() => {
                if (props.selected) props.onAdd(props.selected);
              }}
            >
              장바구니 담기
            </button>
            <p className="offer-description">
              {props.selected.description || "등록된 추가 설명이 없습니다."}
            </p>
            <p className="field-help-text">
              단위당 가격은 비교를 돕는 보조 정보입니다. 품종·원산지·품질과 실제 포장 구성을 함께
              확인해 주세요.
            </p>
          </div>
        ) : props.offers.length > 0 ? (
          <>
            <div className="offer-grid">
              {props.offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onOpen={() => props.onOpen(offer)} />
              ))}
            </div>
            <Pagination
              page={props.page}
              size={20}
              totalItems={props.totalItems}
              onPage={props.onPage}
              label="상품 목록 페이지"
            />
          </>
        ) : (
          !props.error && (
            <div className="market-empty">
              {props.markets.length === 0 ? (
                <>
                  <h2 id="buyerMarketEmpty">조건에 맞는 시장이 없습니다</h2>
                  <p>시도·시군구를 변경하거나 다른 시장명을 검색해 보세요.</p>
                </>
              ) : (
                <>
                  <h2 id="buyerOfferEmpty">오늘 판매할 상품을 기다리고 있어요</h2>
                  <p>다른 시장이나 검색어를 선택해 보세요.</p>
                </>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}
