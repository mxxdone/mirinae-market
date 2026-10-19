export interface MarketLocation {
  marketId: number | null;
  query: string;
  page: number;
  offerId: number | null;
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
  return {
    marketId: positive("market"),
    query: parameters.get("query")?.slice(0, 100) ?? "",
    page: page <= Math.floor(2147483647 / 20) ? page : 0,
    offerId: positive("offer"),
  };
}

/** 방문 기록에는 상품 식별자·검색 조건만 저장하며 API 응답과 인증 정보는 넣지 않는다. */
export function writeMarketLocation(location: MarketLocation, push = false): void {
  const parameters = new URLSearchParams();
  if (location.marketId !== null) {
    parameters.set("market", String(location.marketId));
    parameters.set("query", location.query);
    parameters.set("page", String(location.page));
    if (location.offerId !== null) parameters.set("offer", String(location.offerId));
  }
  const hash = parameters.size ? `#market?${parameters}` : "#market";
  const state = { mirinaeMarketDetail: push && location.offerId !== null };
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
