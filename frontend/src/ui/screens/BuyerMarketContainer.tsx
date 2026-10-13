import { useCallback, useEffect, useRef, useState } from "react";
import { getMarkets, searchOffers, getOffer } from "../../api/products";
import { ApiError, type MarketView, type OfferView } from "../../api/types";
import { todayPickupDate } from "../../validation/productValidation";
import { BuyerCheckoutPanel } from "../components/BuyerCheckoutPanel";
import { putCartItem } from "../../api/checkout";
import { BuyerMarketScreen } from "./BuyerMarketScreen";
import {
  hasMarketDetailHistory,
  isMarketLocation,
  readMarketLocation,
  writeMarketLocation,
} from "../marketLocation";

export function BuyerMarketContainer({
  onAccount,
  onSessionExpired,
}: {
  onAccount: () => void;
  onSessionExpired: () => void;
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [marketId, setMarketId] = useState<number | null>(null);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [selected, setSelected] = useState<OfferView | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayPickupDate);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const handleError = useCallback(
    (failure: unknown) => {
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else
        setError(failure instanceof Error ? failure.message : "상품 정보를 불러오지 못했습니다.");
    },
    [onSessionExpired],
  );
  const load = useCallback(
    async (market: number, text: string, nextPage: number, recordLocation = true) => {
      if (recordLocation)
        writeMarketLocation({ marketId: market, query: text, page: nextPage, offerId: null });
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setMarketId(market);
      setQuery(text);
      setPage(nextPage);
      setOffers([]);
      setSelected(null);
      setError(null);
      setLoading(true);
      try {
        const result = await searchOffers(market, text, nextPage, controller.current.signal);
        if (!mounted.current || current !== request.current) return;
        setOffers(result.items);
        setTotalItems(result.totalItems ?? result.items.length);
      } catch (failure) {
        if (mounted.current && current === request.current) handleError(failure);
      } finally {
        if (mounted.current && current === request.current) setLoading(false);
      }
    },
    [handleError],
  );
  const open = useCallback(
    async (offer: Pick<OfferView, "marketId" | "id">, recordLocation = true) => {
      if (recordLocation) {
        writeMarketLocation(
          { ...readMarketLocation(), marketId: offer.marketId, offerId: offer.id },
          true,
        );
      }
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setSelected(null);
      setLoading(true);
      setError(null);
      try {
        const detail = await getOffer(offer.marketId, offer.id, controller.current.signal);
        if (mounted.current && current === request.current) setSelected(detail);
      } catch (failure) {
        if (mounted.current && current === request.current) handleError(failure);
      } finally {
        if (mounted.current && current === request.current) setLoading(false);
      }
    },
    [handleError],
  );

  const initialize = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getMarkets();
      if (!mounted.current || current !== request.current) return;
      setMarkets(result);
      const location = readMarketLocation();
      const market = result.find((item) => item.id === location.marketId) ?? result[0];
      if (market && market.id === location.marketId && location.offerId !== null) {
        setMarketId(market.id);
        setQuery(location.query);
        setPage(location.page);
        await open({ marketId: market.id, id: location.offerId }, false);
      } else if (market) await load(market.id, location.query, location.page);
      else setLoading(false);
    } catch (failure) {
      if (mounted.current && current === request.current) {
        handleError(failure);
        setLoading(false);
      }
    }
  }, [load, open, handleError]);
  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [initialize]);
  useEffect(() => {
    function restoreLocation() {
      if (!isMarketLocation()) return;
      const location = readMarketLocation();
      const market = markets.find((item) => item.id === location.marketId);
      if (!market) return;
      if (location.offerId !== null) {
        setMarketId(market.id);
        setQuery(location.query);
        setPage(location.page);
        void open({ marketId: market.id, id: location.offerId }, false);
      } else void load(market.id, location.query, location.page, false);
    }
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [markets, load, open]);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = todayPickupDate();
      if (date !== next) {
        setDate(next);
        if (marketId !== null) void load(marketId, query, 0);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [date, marketId, query, load]);
  if (checkoutOpen)
    return (
      <BuyerCheckoutPanel
        onBack={() => setCheckoutOpen(false)}
        onSessionExpired={onSessionExpired}
      />
    );
  return (
    <BuyerMarketScreen
      onCheckout={() => setCheckoutOpen(true)}
      adding={adding}
      onAdd={(offer) => {
        if (adding) return;
        setAdding(true);
        void putCartItem(offer, 1)
          .then(() => {
            if (mounted.current) setCheckoutOpen(true);
          })
          .catch(handleError)
          .finally(() => {
            if (mounted.current) setAdding(false);
          });
      }}
      markets={markets}
      offers={offers}
      selected={selected}
      marketId={marketId}
      loading={loading}
      error={error}
      date={date}
      searchQuery={query}
      page={page}
      totalItems={totalItems}
      onSearch={(market, text) => void load(market, text, 0)}
      onPage={(next) => {
        if (marketId !== null) void load(marketId, query, next);
      }}
      onOpen={(offer) => void open(offer)}
      onBack={() => {
        if (hasMarketDetailHistory()) window.history.back();
        else if (marketId !== null) void load(marketId, query, page);
      }}
      onAccount={onAccount}
      onRetry={() => {
        const location = readMarketLocation();
        if (marketId === null) void initialize();
        else if (location.offerId !== null) void open({ marketId, id: location.offerId }, false);
        else void load(marketId, query, page);
      }}
    />
  );
}
