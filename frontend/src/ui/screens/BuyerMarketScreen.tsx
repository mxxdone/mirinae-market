import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Coordinates } from "../../api/mapSdk";
import type {
  LocatedMarketView,
  MapBounds,
  OfferView,
  RegionView,
  StoreView,
} from "../../api/types";
import { BuyerMarketPicker } from "../components/BuyerMarketPicker";
import { BuyerStoreReportModal } from "../components/BuyerStoreReportModal";
import { useProductImages } from "../useProductImages";
import { ProductPhoto } from "../components/ProductPhoto";
import { OfferCard } from "../components/OfferCard";
import { StoreOtherOffers } from "../components/StoreOtherOffers";
import { QuantityPicker } from "../components/QuantityPicker";
import { purchaseQuantity } from "../../validation/checkoutValidation";
import { Pagination } from "../components/Pagination";
import { StatusAlert } from "../components/StatusAlert";
import { StoreRating, StoreReviews } from "../components/StoreReviews";
import type { ReviewSummary } from "../../api/reviews";
import type { MarketTab } from "../marketLocation";

interface Props {
  ratings: Record<number, ReviewSummary>;
  ratingLoading: boolean;
  ratingError: boolean;
  onRetryRatings: () => void;
  choosingMarket: boolean;
  onChangeMarket: () => void;
  onConfirmMarket: (marketId: number) => void;
  onCheckout: () => void;
  onAdd: (offer: OfferView, quantity?: number) => void;
  onBuyNow: (offer: OfferView, quantity: number) => void;
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
  onRetry: () => void;
  onSessionExpired: () => void;

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
  mapSearchActive: boolean;
  onSearchMap: (bounds: MapBounds) => Promise<boolean>;
  nearbyActive: boolean;
  userCoords: Coordinates | null;
  locationNotice: string | null;
  locationError: string | null;

  // 매장 탭 및 개별 매장 페이지
  tab: MarketTab;
  onTabChange: (tab: MarketTab) => void;
  stores: StoreView[];
  storeQuery: string;
  storePage: number;
  storeTotalItems: number;
  onStoreSearch: (marketId: number, query: string) => void;
  onStorePage: (page: number) => void;
  onOpenStore: (storeId: number) => void;
  selectedStore: StoreView | null;
  storeOffers: OfferView[];
  storeOfferPage: number;
  storeOfferTotal: number;
  storeOfferLoading: boolean;
  onStoreOfferPage: (page: number) => void;
  onStoreBack: () => void;
  onAddStoreOffer: (offer: OfferView) => void;
  storeCartNotice: { offerName: string } | null;
  onClearStoreCartNotice: () => void;
}

export function BuyerMarketScreen(props: Props) {
  const [productQuery, setProductQuery] = useState("");
  const [storeQueryInput, setStoreQueryInput] = useState("");
  const [isProductComposing, setIsProductComposing] = useState(false);
  const [isStoreComposing, setIsStoreComposing] = useState(false);
  const [offerView, setOfferView] = useState<"list" | "grid">("grid");
  const [reportingStore, setReportingStore] = useState<{ id: number; name: string } | null>(null);
  const [detailQuantity, setDetailQuantity] = useState("1");
  useEffect(() => {
    setDetailQuantity("1");
  }, [props.selected?.id]);
  let selectedQuantity: number | null = null;
  try {
    selectedQuantity = purchaseQuantity(detailQuantity);
  } catch {
    /* 입력 중 잘못된 수량은 결제를 막는다. */
  }
  const detailQuantityValid =
    selectedQuantity !== null && selectedQuantity <= (props.selected?.onlineQuantity ?? 0);

  const visibleProducts = props.choosingMarket
    ? []
    : props.selectedStore
      ? props.storeOffers
      : props.selected
        ? [props.selected]
        : props.tab === "offers"
          ? props.offers
          : [];
  const productImages = useProductImages(
    props.marketId,
    visibleProducts.map((offer) => offer.productId),
    props.onSessionExpired,
  );

  const layout = props.choosingMarket
    ? "selection"
    : props.selected || props.selectedStore
      ? "detail"
      : props.tab === "stores"
        ? props.stores.length <= 3
          ? "compact"
          : props.stores.length <= 6
            ? "medium"
            : "wide"
        : props.offers.length <= 3
          ? "compact"
          : props.offers.length <= 6
            ? "medium"
            : "wide";

  const marketHeading = useRef<HTMLHeadingElement>(null);
  const currentMarket = props.markets.find((market) => market.id === props.marketId);
  const heading = useRef<HTMLHeadingElement>(null);
  const storeHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setProductQuery(props.searchQuery);
  }, [props.searchQuery]);

  useEffect(() => {
    setStoreQueryInput(props.storeQuery);
  }, [props.storeQuery]);

  useEffect(() => {
    if (props.selected) heading.current?.focus();
  }, [props.selected]);

  useEffect(() => {
    if (props.selectedStore) storeHeading.current?.focus();
  }, [props.selectedStore]);

  useEffect(() => {
    marketHeading.current?.focus();
  }, [props.choosingMarket]);

  function submitProductSearch(event: FormEvent) {
    event.preventDefault();
    if (isProductComposing) return;
    if (props.marketId !== null) props.onSearch(props.marketId, productQuery);
  }

  function submitStoreSearch(event: FormEvent) {
    event.preventDefault();
    if (isStoreComposing) return;
    if (props.marketId !== null) props.onStoreSearch(props.marketId, storeQueryInput);
  }

  function submitMarketNameSearch(event: FormEvent) {
    event.preventDefault();
    props.onSearchMarketName();
  }

  const productSearchForm = (
    <form className="market-search-bar" onSubmit={submitProductSearch}>
      <div className="field-group search-query">
        <label className="sr-only" htmlFor="productSearch">
          찾는 상품
        </label>
        <input
          className="input-box"
          id="productSearch"
          value={productQuery}
          onChange={(event) => setProductQuery(event.target.value)}
          onCompositionStart={() => setIsProductComposing(true)}
          onCompositionEnd={() => setIsProductComposing(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (isProductComposing || event.nativeEvent.isComposing)) {
              event.preventDefault();
            }
          }}
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
  );

  const offerViewControls = (
    <div className="offer-view-controls" role="group" aria-label="상품 보기 방식">
      {productImages.failed && (
        <span className="product-image-warning">
          사진 정보를 불러오지 못했습니다.{" "}
          <button type="button" onClick={productImages.retry}>
            사진 다시 조회
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label="리스트형"
        title="리스트형 보기"
        aria-pressed={offerView === "list"}
        onClick={() => setOfferView("list")}
      >
        {/* Lucide layout-list의 ISC 라이선스: /licenses/lucide.txt */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
          <path d="M14 4h7M14 9h7M14 15h7M14 20h7" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="카드형"
        title="카드형 보기"
        aria-pressed={offerView === "grid"}
        onClick={() => setOfferView("grid")}
      >
        {/* Lucide layout-grid의 ISC 라이선스: /licenses/lucide.txt */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      </button>
    </div>
  );

  // 시도 목록은 중복 없이 표시합니다.
  const provinces = Array.from(
    new Map(
      props.regions.map((r) => [r.provinceCode, { code: r.provinceCode, name: r.provinceName }]),
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  // 선택한 시도에 속하는 시군구만 표시합니다.
  const districts = props.regions.filter((r) => r.provinceCode === props.selectedProvince);

  return (
    <section
      className="hybrid-card market-workspace"
      data-layout={layout}
      aria-labelledby="heading-market"
    >
      <header className="summary-card-header market-header">
        <div className="summary-tag-row buyer-heading-row">
          <h1 id="heading-market" ref={marketHeading} tabIndex={-1} className="summary-heading">
            {props.choosingMarket ? "장볼 시장을 선택해 주세요" : "우리 시장, 오늘의 좋은 먹거리"}
          </h1>
        </div>
        {!props.choosingMarket && props.ratingError && (
          <button type="button" onClick={props.onRetryRatings}>
            매장 평점 다시 불러오기
          </button>
        )}
        {!props.choosingMarket && (
          <p className="summary-subtext">
            {props.date} 방문 수령 · 포장 구성과 매장별 가격을 살펴보세요.
          </p>
        )}
      </header>

      <div className="summary-card-body market-body">
        {props.storeCartNotice && !props.selectedStore && (
          <p role="status" className="cart-added-notice">
            {props.storeCartNotice.offerName}이(가) 장바구니에 담겼습니다.
          </p>
        )}
        <div hidden={!props.choosingMarket} className="buyer-market-selection">
          {/* 1. 지역별 선택 및 내 주변 필터 영역 */}
          <div className="market-filter-panel" aria-label="지역 및 위치 필터">
            <form className="filter-controls-row" onSubmit={submitMarketNameSearch}>
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
              <div className="field-group market-name-search-form">
                <label className="field-label" htmlFor="buyerInputMarketName">
                  시장명 검색
                </label>
                <div className="input-with-button">
                  <input
                    className="input-box"
                    id="buyerInputMarketName"
                    value={props.marketNameQuery}
                    onChange={(e) => props.onMarketNameQueryChange(e.target.value)}
                    placeholder="예: 광장시장"
                    maxLength={100}
                  />
                  <button type="submit" id="btnSearchMarketName" className="btn-secondary-sm">
                    검색
                  </button>
                </div>
              </div>

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
            </form>

            {/* 위치 관련 안내 또는 오류 메시지 */}
            {props.locationError && (
              <p role="alert" className="error-text" id="buyerLocationError">
                {props.locationError}
              </p>
            )}
            {props.locationNotice && !props.mapSearchActive && (
              <p role="status" className="notice-text" id="buyerLocationNotice">
                {props.locationNotice}
              </p>
            )}
          </div>

          {props.loading && <p role="status">시장 정보를 확인하는 중…</p>}
          <BuyerMarketPicker
            markets={props.markets}
            loading={props.loading}
            hasError={Boolean(props.error)}
            active={props.choosingMarket}
            mapSearchActive={props.mapSearchActive}
            onSearchMap={props.onSearchMap}
            nearby={props.nearbyActive}
            userCoords={props.userCoords}
            onOpenMarket={(id) => {
              setProductQuery("");
              props.onConfirmMarket(id);
            }}
          />
          <StatusAlert
            message={props.choosingMarket ? props.error : null}
            onRetry={props.onRetry}
          />
        </div>

        <div hidden={props.choosingMarket} className="buyer-product-browse">
          <div className="buyer-current-market">
            <div>
              <span>선택한 시장</span>
              <h2>{currentMarket?.name ?? "시장 확인 중…"}</h2>
              <p>{currentMarket?.regionLabel || "위치 미등록"}</p>
            </div>
            <button
              type="button"
              id="btnChangeBuyerMarket"
              className="text-action-link"
              onClick={props.onChangeMarket}
            >
              시장 변경
            </button>
          </div>

          <StatusAlert message={props.error} onRetry={props.onRetry} />

          {/* 개별 매장 페이지 화면 */}
          {props.selectedStore ? (
            <div className="offer-detail buyer-store-page">
              <button
                className="text-action-link"
                id="btnStoreBack"
                type="button"
                onClick={props.onStoreBack}
              >
                ← 뒤로 가기
              </button>
              <div className="offer-store-row">
                <h2 ref={storeHeading} tabIndex={-1} id="heading-store-page">
                  {props.selectedStore.name}
                </h2>
                <StoreRating
                  summary={props.ratings[props.selectedStore.id]}
                  loading={props.ratingLoading}
                  failed={props.ratingError}
                />
                <button
                  type="button"
                  id="btnReportStore"
                  className="text-action-link btn-report-store"
                  onClick={() =>
                    setReportingStore({
                      id: props.selectedStore!.id,
                      name: props.selectedStore!.name,
                    })
                  }
                >
                  매장 제보
                </button>
              </div>

              {props.storeCartNotice && (
                <div className="store-cart-banner" role="status" aria-live="polite">
                  <p className="store-cart-message">
                    <strong>{props.storeCartNotice.offerName}</strong>이(가) 장바구니에 담겼습니다.
                  </p>
                  <div className="store-cart-actions">
                    <button
                      type="button"
                      id="btnStoreKeepShopping"
                      className="btn-secondary-sm"
                      onClick={props.onClearStoreCartNotice}
                    >
                      계속 담기
                    </button>
                    <button
                      type="button"
                      id="btnStoreGoToCart"
                      className="btn-query-store"
                      onClick={props.onCheckout}
                    >
                      장바구니로 이동
                    </button>
                  </div>
                </div>
              )}

              {props.storeOfferLoading ? (
                <p role="status" className="market-empty">
                  매장 상품을 불러오고 있습니다.
                </p>
              ) : props.storeOffers.length > 0 ? (
                <>
                  {offerViewControls}
                  <div className="offer-grid" data-view={offerView}>
                    {props.storeOffers.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        image={productImages.images[offer.productId]}
                        view={offerView}
                        showStore={false}
                        onOpen={() => props.onOpen(offer)}
                        onAdd={() => props.onAddStoreOffer(offer)}
                        adding={props.adding}
                      />
                    ))}
                  </div>
                  <Pagination
                    page={props.storeOfferPage}
                    size={20}
                    totalItems={props.storeOfferTotal}
                    onPage={props.onStoreOfferPage}
                    label="매장 상품 페이지"
                  />
                </>
              ) : (
                <div className="market-empty">
                  <h3 id="storeOfferEmpty">오늘 판매할 상품을 준비하고 있어요</h3>
                  <p>이 매장의 오늘 판매 상품이 아직 등록되지 않았습니다.</p>
                </div>
              )}
              <StoreReviews
                key={props.selectedStore.id}
                marketId={props.marketId!}
                storeId={props.selectedStore.id}
                onSessionExpired={props.onSessionExpired}
              />
            </div>
          ) : props.selected ? (
            /* 상품 상세 화면 */
            <div className="offer-detail product-detail">
              {productSearchForm}
              <button className="text-action-link" type="button" onClick={props.onBack}>
                ← 상품 목록으로
              </button>
              <div className="product-detail-layout">
                <div className="product-detail-media">
                  <ProductPhoto
                    image={productImages.images[props.selected.productId]}
                    name={props.selected.productName}
                    detail
                  />
                  {productImages.failed && (
                    <p role="alert">
                      사진을 불러오지 못했습니다.{" "}
                      <button type="button" onClick={productImages.retry}>
                        사진 다시 조회
                      </button>
                    </p>
                  )}
                </div>
                <div className="product-detail-info">
                  <div className="offer-store-row">
                    <p className="offer-store-name">
                      <button
                        type="button"
                        className="text-action-link offer-store-link"
                        onClick={() => props.onOpenStore(props.selected!.storeId)}
                      >
                        {props.selected.storeName}
                      </button>
                    </p>
                    <button
                      type="button"
                      id="btnReportStore"
                      className="text-action-link btn-report-store"
                      onClick={() =>
                        setReportingStore({
                          id: props.selected!.storeId,
                          name: props.selected!.storeName,
                        })
                      }
                    >
                      매장 제보
                    </button>
                  </div>
                  <StoreRating
                    summary={props.ratings[props.selected.storeId]}
                    loading={props.ratingLoading}
                    failed={props.ratingError}
                  />
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
                  <div className="detail-purchase">
                    <span>수량 · 포장</span>
                    <QuantityPicker
                      id="detail-quantity"
                      label="구매 수량"
                      value={detailQuantity}
                      maximum={props.selected.onlineQuantity}
                      disabled={props.adding || props.selected.onlineQuantity === 0}
                      onChange={setDetailQuantity}
                    />
                    {!detailQuantityValid && props.selected.onlineQuantity > 0 && (
                      <p role="alert">
                        1~{props.selected.onlineQuantity.toLocaleString()}포장 사이로 입력해 주세요.
                      </p>
                    )}
                    <p className="detail-total">
                      상품 금액{" "}
                      <strong>
                        {selectedQuantity !== null
                          ? (
                              BigInt(props.selected.priceWon) * BigInt(selectedQuantity)
                            ).toLocaleString()
                          : "—"}
                        원
                      </strong>
                    </p>
                    <div className="detail-purchase-actions">
                      <button
                        type="button"
                        className="btn-secondary-sm"
                        disabled={props.adding || !detailQuantityValid}
                        onClick={() => {
                          if (props.selected && selectedQuantity !== null)
                            props.onAdd(props.selected, selectedQuantity);
                        }}
                      >
                        장바구니 담기
                      </button>
                      <button
                        type="button"
                        className="btn-query-store"
                        disabled={props.adding || !detailQuantityValid}
                        onClick={() => {
                          if (props.selected && selectedQuantity !== null)
                            props.onBuyNow(props.selected, selectedQuantity);
                        }}
                      >
                        바로 구매
                      </button>
                    </div>
                  </div>
                  <p className="offer-description">
                    {props.selected.description || "등록된 추가 설명이 없습니다."}
                  </p>
                  <p className="field-help-text">
                    단위당 가격은 비교를 돕는 보조 정보입니다. 품종·원산지·품질과 실제 포장 구성을
                    함께 확인해 주세요.
                  </p>
                </div>
              </div>
              <StoreOtherOffers
                key={props.selected.id}
                selected={props.selected}
                onOpen={props.onOpen}
                onOpenStore={props.onOpenStore}
                onSessionExpired={props.onSessionExpired}
              />
            </div>
          ) : (
            /* 상품 / 매장 탭 탐색 영역 */
            <>
              <div
                className="market-nav-tabs"
                role="tablist"
                aria-label="시장 둘러보기"
                onKeyDown={(event) => {
                  if (
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "offers"
                      : event.key === "End"
                        ? "stores"
                        : props.tab === "offers"
                          ? "stores"
                          : "offers";
                  props.onTabChange(next);
                  (next === "offers"
                    ? event.currentTarget.querySelector<HTMLButtonElement>("#tabMarketOffers")
                    : event.currentTarget.querySelector<HTMLButtonElement>("#tabMarketStores")
                  )?.focus();
                }}
              >
                <button
                  type="button"
                  role="tab"
                  id="tabMarketOffers"
                  className={`market-tab-button ${props.tab === "offers" ? "active" : ""}`}
                  aria-selected={props.tab === "offers"}
                  tabIndex={props.tab === "offers" ? 0 : -1}
                  aria-controls="panelMarketOffers"
                  onClick={() => props.onTabChange("offers")}
                >
                  상품
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tabMarketStores"
                  className={`market-tab-button ${props.tab === "stores" ? "active" : ""}`}
                  aria-selected={props.tab === "stores"}
                  tabIndex={props.tab === "stores" ? 0 : -1}
                  aria-controls="panelMarketStores"
                  onClick={() => props.onTabChange("stores")}
                >
                  매장
                </button>
              </div>

              {props.tab === "offers" ? (
                <div id="panelMarketOffers" role="tabpanel" aria-labelledby="tabMarketOffers">
                  <div className="buyer-offer-toolbar">
                    {productSearchForm}
                    {!props.loading && props.offers.length > 0 && offerViewControls}
                  </div>

                  {props.loading ? (
                    <p role="status" className="market-empty">
                      시장 상품을 불러오고 있습니다.
                    </p>
                  ) : props.offers.length > 0 ? (
                    <>
                      <div className="offer-grid" data-view={offerView}>
                        {props.offers.map((offer) => (
                          <OfferCard
                            key={offer.id}
                            offer={offer}
                            image={productImages.images[offer.productId]}
                            view={offerView}
                            onOpen={() => props.onOpen(offer)}
                            onOpenStore={props.onOpenStore}
                            onAdd={() => props.onAdd(offer)}
                            adding={props.adding}
                            rating={props.ratings[offer.storeId]}
                            ratingLoading={props.ratingLoading}
                            ratingError={props.ratingError}
                          />
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
                            <h2 id="buyerOfferMarketEmpty">조건에 맞는 시장이 없습니다</h2>
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
              ) : (
                <div id="panelMarketStores" role="tabpanel" aria-labelledby="tabMarketStores">
                  <form className="market-search-bar" onSubmit={submitStoreSearch}>
                    <div className="field-group search-query">
                      <label className="sr-only" htmlFor="storeSearch">
                        찾는 매장
                      </label>
                      <input
                        className="input-box"
                        id="storeSearch"
                        value={storeQueryInput}
                        onChange={(event) => setStoreQueryInput(event.target.value)}
                        onCompositionStart={() => setIsStoreComposing(true)}
                        onCompositionEnd={() => setIsStoreComposing(false)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            (isStoreComposing || event.nativeEvent.isComposing)
                          ) {
                            event.preventDefault();
                          }
                        }}
                        maxLength={100}
                        placeholder="매장 이름 검색…"
                      />
                    </div>
                    <button
                      id="btnSearchStore"
                      className="btn-query-store"
                      disabled={props.loading || props.marketId === null}
                      type="submit"
                    >
                      매장 검색
                    </button>
                  </form>

                  {props.loading ? (
                    <p role="status" className="market-empty">
                      매장 정보를 불러오고 있습니다.
                    </p>
                  ) : props.stores.length > 0 ? (
                    <>
                      <div className="store-grid">
                        {props.stores.map((store) => (
                          <article key={store.id} className="store-card">
                            <div className="store-card-info">
                              <h3 className="store-card-name">{store.name}</h3>
                              <StoreRating
                                summary={props.ratings[store.id]}
                                loading={props.ratingLoading}
                                failed={props.ratingError}
                              />
                            </div>
                            <button
                              type="button"
                              className="btn-query-store store-detail-button"
                              onClick={() => props.onOpenStore(store.id)}
                            >
                              매장 둘러보기
                              <span className="sr-only"> · {store.name}</span>
                            </button>
                          </article>
                        ))}
                      </div>
                      <Pagination
                        page={props.storePage}
                        size={20}
                        totalItems={props.storeTotalItems}
                        onPage={props.onStorePage}
                        label="매장 목록 페이지"
                      />
                    </>
                  ) : (
                    !props.error && (
                      <div className="market-empty">
                        <h2 id="buyerStoreEmpty">조건에 맞는 매장이 없습니다</h2>
                        <p>다른 매장명을 검색해 보세요.</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {reportingStore && (
        <BuyerStoreReportModal
          storeId={reportingStore.id}
          storeName={reportingStore.name}
          onClose={() => setReportingStore(null)}
          onSessionExpired={props.onSessionExpired}
        />
      )}
    </section>
  );
}
