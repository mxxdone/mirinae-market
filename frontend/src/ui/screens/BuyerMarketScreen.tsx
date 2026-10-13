import { useEffect, useRef, useState, type FormEvent } from "react";
import type { MarketView, OfferView } from "../../api/types";
import { OfferCard } from "../components/OfferCard";
import { StatusAlert } from "../components/StatusAlert";
import { Pagination } from "../components/Pagination";

interface Props {
  markets: MarketView[];
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
}
export function BuyerMarketScreen(props: Props) {
  const [query, setQuery] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setQuery(props.searchQuery);
  }, [props.searchQuery]);
  useEffect(() => {
    if (props.selected) heading.current?.focus();
  }, [props.selected]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (props.marketId !== null) props.onSearch(props.marketId, query);
  }
  return (
    <section className="hybrid-card market-workspace" aria-labelledby="heading-market">
      <header className="summary-card-header market-header">
        <div className="summary-tag-row">
          <span className="pill-badge primary">오늘의 장보기</span>
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
        <form className="market-search-bar" onSubmit={submit}>
          <div className="field-group">
            <label className="field-label" htmlFor="marketSelect">
              시장 선택
            </label>
            <select
              className="input-box"
              id="marketSelect"
              value={props.marketId ?? ""}
              onChange={(event) => {
                setQuery("");
                props.onSearch(Number(event.target.value), "");
              }}
              disabled={props.markets.length === 0}
            >
              <option value="" disabled>
                시장을 선택해 주세요
              </option>
              {props.markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.name}
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
              <h2>
                {props.markets.length === 0
                  ? "아직 등록된 시장이 없습니다"
                  : "오늘 판매할 상품을 기다리고 있어요"}
              </h2>
              <p>다른 시장이나 검색어를 선택해 보세요.</p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
