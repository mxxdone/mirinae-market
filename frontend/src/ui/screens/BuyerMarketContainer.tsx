import { useCallback, useEffect, useRef, useState } from "react";
import { getMarkets, searchOffers, getOffer } from "../../api/products";
import { ApiError, type MarketView, type OfferView } from "../../api/types";
import { tomorrowPickupDate } from "../../validation/productValidation";
import { BuyerMarketScreen } from "./BuyerMarketScreen";

export function BuyerMarketContainer({
  onAccount,
  onSessionExpired,
}: {
  onAccount: () => void;
  onSessionExpired: () => void;
}) {
  const [markets, setMarkets] = useState<MarketView[]>([]);
  const [marketId, setMarketId] = useState<number | null>(null);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [selected, setSelected] = useState<OfferView | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(tomorrowPickupDate);
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
    async (market: number, text: string, nextPage: number) => {
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
        setHasNext(result.hasNext);
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
      if (result[0]) await load(result[0].id, "", 0);
      else setLoading(false);
    } catch (failure) {
      if (mounted.current && current === request.current) {
        handleError(failure);
        setLoading(false);
      }
    }
  }, [load, handleError]);
  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [initialize]);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = tomorrowPickupDate();
      if (date !== next) {
        setDate(next);
        if (marketId !== null) void load(marketId, query, 0);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [date, marketId, query, load]);
  async function open(offer: OfferView) {
    controller.current?.abort();
    controller.current = new AbortController();
    const current = ++request.current;
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
  }
  return (
    <BuyerMarketScreen
      markets={markets}
      offers={offers}
      selected={selected}
      marketId={marketId}
      loading={loading}
      error={error}
      date={date}
      page={page}
      hasNext={hasNext}
      onSearch={(market, text) => void load(market, text, 0)}
      onPage={(next) => {
        if (marketId !== null) void load(marketId, query, next);
      }}
      onOpen={(offer) => void open(offer)}
      onBack={() => {
        setSelected(null);
        setError(null);
      }}
      onAccount={onAccount}
      onRetry={() => {
        if (marketId === null) void initialize();
        else if (selected) void open(selected);
        else void load(marketId, query, page);
      }}
    />
  );
}
