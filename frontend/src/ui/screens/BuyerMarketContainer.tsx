import { useCallback, useEffect, useRef, useState } from "react";
import { putCartItem } from "../../api/checkout";
import { getMarketRegions } from "../../api/location";
import type { Coordinates } from "../../api/mapSdk";
import { getMarkets, getOffer, searchOffers } from "../../api/products";
import {
  ApiError,
  type LocatedMarketView,
  type MarketFilterParams,
  type OfferView,
  type RegionView,
} from "../../api/types";
import { todayPickupDate } from "../../validation/productValidation";
import {
  hasMarketDetailHistory,
  isMarketLocation,
  readMarketLocation,
  writeMarketLocation,
} from "../marketLocation";
import { BuyerMarketScreen } from "./BuyerMarketScreen";

export function BuyerMarketContainer({
  onAccount,
  onCart,
  onOrders,
  onSessionExpired,
}: {
  onAccount: () => void;
  onCart: () => void;
  onOrders: () => void;
  onSessionExpired: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [choosingMarket, setChoosingMarket] = useState(
    () => readMarketLocation().marketId === null,
  );
  const [regions, setRegions] = useState<RegionView[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [marketNameQuery, setMarketNameQuery] = useState("");
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [nearbyActive, setNearbyActive] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [markets, setMarkets] = useState<LocatedMarketView[]>([]);
  const [marketId, setMarketId] = useState<number | null>(null);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [selected, setSelected] = useState<OfferView | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayPickupDate);

  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const marketReqController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const marketRequest = useRef(0);
  const geoRequest = useRef(0);

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
      setProductQuery(text);
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

  const fetchMarkets = useCallback(
    async (params?: MarketFilterParams) => {
      const current = ++marketRequest.current;
      ++request.current;
      controller.current?.abort();
      setSelected(null);
      setOffers([]);
      setMarkets([]);
      setTotalItems(0);
      setError(null);
      setLoading(true);
      marketReqController.current?.abort();
      marketReqController.current = new AbortController();
      try {
        const result = await getMarkets(params, marketReqController.current.signal);
        if (!mounted.current || current !== marketRequest.current) return;
        setMarkets(result);

        if (params?.latitude !== undefined && params?.longitude !== undefined) {
          if (result.length === 0) {
            setLocationNotice(
              "10km 이내에 등록된 시장이 없습니다. 시도·시군구 지역 선택을 이용해 보세요.",
            );
          } else {
            setLocationNotice(null);
          }
        }

        if (result.length === 0) {
          setMarketId(null);
          setOffers([]);
          setTotalItems(0);
          setLoading(false);
        } else {
          const targetMarket = result.find((m) => m.id === marketId) ?? result[0];
          if (targetMarket) {
            void load(targetMarket.id, "", 0, !choosingMarket);
          }
        }
      } catch (failure) {
        if (mounted.current && current === marketRequest.current) {
          handleError(failure);
          setLoading(false);
        }
      }
    },
    [marketId, load, handleError, choosingMarket],
  );

  const initialize = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [regionList, marketList] = await Promise.all([getMarketRegions(), getMarkets()]);
      if (!mounted.current || current !== request.current) return;
      setRegions(regionList);
      setMarkets(marketList);

      const location = readMarketLocation();
      const market = marketList.find((item) => item.id === location.marketId) ?? marketList[0];
      if (market && market.id === location.marketId && location.offerId !== null) {
        setMarketId(market.id);
        setProductQuery(location.query);
        setPage(location.page);
        await open({ marketId: market.id, id: location.offerId }, false);
      } else if (market) {
        await load(market.id, location.query, location.page, location.marketId !== null);
      } else {
        setLoading(false);
      }
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
      ++geoRequest.current;
      ++marketRequest.current;
      ++request.current;
      controller.current?.abort();
      marketReqController.current?.abort();
    };
  }, [initialize]);

  useEffect(() => {
    function restoreLocation() {
      const location = readMarketLocation();
      if (!isMarketLocation() || location.marketId === null) {
        setChoosingMarket(true);
        return;
      }
      setChoosingMarket(false);
      const market = markets.find((item) => item.id === location.marketId);
      if (!market) return;
      if (location.offerId !== null) {
        setMarketId(market.id);
        setProductQuery(location.query);
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
        if (marketId !== null) void load(marketId, productQuery, 0, !choosingMarket);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [date, marketId, productQuery, load, choosingMarket]);

  function handleProvinceChange(code: string) {
    ++geoRequest.current;
    setSelectedProvince(code);
    setSelectedDistrict("");
    setNearbyActive(false);
    setUserCoords(null);
    setLocationNotice(null);
    setLocationError(null);
    void fetchMarkets({
      provinceCode: code || undefined,
      query: marketNameQuery.trim() || undefined,
    });
  }

  function handleDistrictChange(code: string) {
    ++geoRequest.current;
    setSelectedDistrict(code);
    setNearbyActive(false);
    setUserCoords(null);
    setLocationNotice(null);
    setLocationError(null);
    void fetchMarkets({
      provinceCode: selectedProvince || undefined,
      regionCode: code || undefined,
      query: marketNameQuery.trim() || undefined,
    });
  }

  function handleSearchMarketName() {
    ++geoRequest.current;
    void fetchMarkets({
      provinceCode: selectedProvince || undefined,
      regionCode: selectedDistrict || undefined,
      query: marketNameQuery.trim() || undefined,
      latitude: nearbyActive ? userCoords?.latitude : undefined,
      longitude: nearbyActive ? userCoords?.longitude : undefined,
    });
  }

  function handleNearbyClick() {
    const current = ++geoRequest.current;
    if (!navigator.geolocation) {
      setLocationError(
        "이 브라우저는 위치 서비스를 지원하지 않습니다. 시도·시군구 지역 선택을 이용해 주세요.",
      );
      return;
    }

    setLocationError(null);
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current || current !== geoRequest.current) return;
        const coords: Coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserCoords(coords);
        setNearbyActive(true);
        setSelectedProvince("");
        setSelectedDistrict("");
        void fetchMarkets({
          latitude: coords.latitude,
          longitude: coords.longitude,
          query: marketNameQuery.trim() || undefined,
        });
      },
      (err) => {
        if (!mounted.current || current !== geoRequest.current) return;
        setNearbyActive(false);
        setUserCoords(null);
        if (err.code === 1) {
          setLocationError("위치 권한이 거부되었습니다. 시도·시군구 지역 선택을 이용해 주세요.");
        } else {
          setLocationError(
            "현재 위치를 확인할 수 없습니다. 시도·시군구 지역 선택을 이용해 주세요.",
          );
        }
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  }

  function handleSelectMarket(id: number) {
    if (id === marketId) return;
    void load(id, "", 0, !choosingMarket);
  }

  return (
    <BuyerMarketScreen
      choosingMarket={choosingMarket}
      onChangeMarket={() => setChoosingMarket(true)}
      onConfirmMarket={() => {
        if (marketId === null) return;
        writeMarketLocation({ marketId, query: productQuery, page, offerId: null }, true);
        setChoosingMarket(false);
      }}
      onCheckout={onCart}
      onOrders={onOrders}
      adding={adding}
      onAdd={(offer) => {
        if (adding) return;
        setAdding(true);
        void putCartItem(offer, 1)
          .then(() => {
            if (mounted.current) onCart();
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
      searchQuery={productQuery}
      page={page}
      totalItems={totalItems}
      onSearch={(market, text) => void load(market, text, 0)}
      onPage={(next) => {
        if (marketId !== null) void load(marketId, productQuery, next);
      }}
      onOpen={(offer) => void open(offer)}
      onBack={() => {
        if (hasMarketDetailHistory()) window.history.back();
        else if (marketId !== null) void load(marketId, productQuery, page);
      }}
      onAccount={onAccount}
      onRetry={() => {
        const location = readMarketLocation();
        if (marketId === null) void initialize();
        else if (location.offerId !== null) void open({ marketId, id: location.offerId }, false);
        else void load(marketId, productQuery, page, !choosingMarket);
      }}
      regions={regions}
      selectedProvince={selectedProvince}
      selectedDistrict={selectedDistrict}
      onProvinceChange={handleProvinceChange}
      onDistrictChange={handleDistrictChange}
      marketNameQuery={marketNameQuery}
      onMarketNameQueryChange={setMarketNameQuery}
      onSearchMarketName={handleSearchMarketName}
      onNearbyClick={handleNearbyClick}
      nearbyActive={nearbyActive}
      userCoords={userCoords}
      locationNotice={locationNotice}
      locationError={locationError}
      onSelectMarket={handleSelectMarket}
      onSessionExpired={onSessionExpired}
    />
  );
}
