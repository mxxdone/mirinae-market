export type MarketTab = "offers" | "stores";

export interface MarketLocation {
  marketId: number | null;
  tab?: MarketTab;
  query: string;
  page: number;
  offerId: number | null;
  storeQuery?: string;
  storePage?: number;
  storeId?: number | null;
  storeOfferPage?: number;
}

export function isMarketLocation(): boolean {
  return window.location.hash === "#market" || window.location.hash.startsWith("#market?");
}

export function readMarketLocation(hash = window.location.hash): MarketLocation {
  const parameters = new URLSearchParams(
    hash === "#market" || hash.startsWith("#market?") ? hash.split("?")[1] : "",
  );
  function positive(name: string): number | null {
    const value = parameters.get(name);
    if (!value || !/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }
  const page = positive("page") ?? 0;
  const storePage = positive("storePage") ?? 0;
  const storeOfferPage = positive("storeOfferPage") ?? 0;
  const maxPage = Math.floor(2147483647 / 20);
  const tabParam = parameters.get("tab");
  const tab: MarketTab = tabParam === "stores" ? "stores" : "offers";

  return {
    marketId: positive("market"),
    tab,
    query: parameters.get("query")?.slice(0, 100) ?? "",
    page: page <= maxPage ? page : 0,
    offerId: positive("offer"),
    storeQuery: parameters.get("storeQuery")?.slice(0, 100) ?? "",
    storePage: storePage <= maxPage ? storePage : 0,
    storeId: positive("store"),
    storeOfferPage: storeOfferPage <= maxPage ? storeOfferPage : 0,
  };
}

/** 방문 기록에는 상품·매장 식별자·검색 조건만 저장하며 API 응답과 인증 정보는 넣지 않는다. */
export function writeMarketLocation(location: MarketLocation, push = false): void {
  const parameters = new URLSearchParams();
  if (location.marketId !== null) {
    parameters.set("market", String(location.marketId));
    if (location.tab === "stores") {
      parameters.set("tab", "stores");
    }
    parameters.set("query", location.query);
    parameters.set("page", String(location.page));
    if (location.offerId !== null) parameters.set("offer", String(location.offerId));
    if (location.storeQuery) parameters.set("storeQuery", location.storeQuery);
    if (location.storePage && location.storePage > 0) {
      parameters.set("storePage", String(location.storePage));
    }
    if (location.storeId !== null && location.storeId !== undefined) {
      parameters.set("store", String(location.storeId));
    }
    if (location.storeOfferPage && location.storeOfferPage > 0) {
      parameters.set("storeOfferPage", String(location.storeOfferPage));
    }
  }
  const hash = parameters.size ? `#market?${parameters}` : "#market";
  const state = {
    mirinaeMarketDetail:
      push &&
      (location.offerId !== null || (location.storeId !== null && location.storeId !== undefined)),
  };
  if (push) window.history.pushState(state, "", hash);
  else window.history.replaceState(state, "", hash);
}

export function hasMarketDetailHistory(): boolean {
  const state = window.history.state as { mirinaeMarketDetail?: unknown } | null;
  return state?.mirinaeMarketDetail === true;
}

export function leaveMarketLocation(push = false): void {
  const url = window.location.pathname + window.location.search;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}
