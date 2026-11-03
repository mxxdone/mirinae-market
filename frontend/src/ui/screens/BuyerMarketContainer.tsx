import { useCallback, useEffect, useRef, useState } from "react";
import { putCartItem } from "../../api/checkout";
import { getMarketRegions } from "../../api/location";
import type { Coordinates } from "../../api/mapSdk";
import { getMarkets, getOffer, searchOffers } from "../../api/products";
import { getMarketStore, getStoreOffers, searchStores } from "../../api/store";
import {
  ApiError,
  type LocatedMarketView,
  type MarketFilterParams,
  type OfferView,
  type RegionView,
  type StoreView,
} from "../../api/types";
import { todayPickupDate } from "../../validation/productValidation";
import {
  hasMarketDetailHistory,
  isMarketLocation,
  readMarketLocation,
  writeMarketLocation,
  type MarketTab,
} from "../marketLocation";
import { BuyerMarketScreen } from "./BuyerMarketScreen";
import { useStoreRatings } from "../useStoreRatings";

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
  const initialLocation = readMarketLocation();

  const [adding, setAdding] = useState(false);
  const [choosingMarket, setChoosingMarket] = useState(() => initialLocation.marketId === null);
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
  const [tab, setTab] = useState<MarketTab>(() => initialLocation.tab ?? "offers");

  // 상품 탭 상태
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [selected, setSelected] = useState<OfferView | null>(null);
  const [productQuery, setProductQuery] = useState(() => initialLocation.query);
  const [page, setPage] = useState(() => initialLocation.page);
  const [totalItems, setTotalItems] = useState(0);

  // 매장 탭 상태
  const [stores, setStores] = useState<StoreView[]>([]);
  const [storeQuery, setStoreQuery] = useState(() => initialLocation.storeQuery ?? "");
  const [storePage, setStorePage] = useState(() => initialLocation.storePage ?? 0);
  const [storeTotalItems, setStoreTotalItems] = useState(0);

  // 개별 매장 페이지 상태
  const [selectedStore, setSelectedStore] = useState<StoreView | null>(null);
  const [storeOffers, setStoreOffers] = useState<OfferView[]>([]);
  const [storeOfferPage, setStoreOfferPage] = useState(0);
  const [storeOfferTotal, setStoreOfferTotal] = useState(0);
  const [storeOfferLoading, setStoreOfferLoading] = useState(false);
  const [storeCartNotice, setStoreCartNotice] = useState<{ offerName: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayPickupDate);

  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const marketReqController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const marketRequest = useRef(0);
  const geoRequest = useRef(0);

  const marketStateRef = useRef({
    productQuery,
    page,
    storeQuery,
    storePage,
    tab,
    marketId,
    selectedStore,
    storeOfferPage,
    choosingMarket,
  });
  marketStateRef.current = {
    productQuery,
    page,
    storeQuery,
    storePage,
    tab,
    marketId,
    selectedStore,
    storeOfferPage,
    choosingMarket,
  };

  const handleError = useCallback(
    (failure: unknown) => {
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(failure instanceof Error ? failure.message : "정보를 불러오지 못했습니다.");
    },
    [onSessionExpired],
  );

  const loadOffers = useCallback(
    async (market: number, text: string, nextPage: number, recordLocation = true) => {
      const location = readMarketLocation();
      const currentStoreQuery = location.marketId === market ? location.storeQuery : "";
      const currentStorePage = location.marketId === market ? location.storePage : 0;
      if (recordLocation) {
        writeMarketLocation({
          marketId: market,
          tab: "offers",
          query: text,
          page: nextPage,
          offerId: null,
          storeId: null,
          storeQuery: currentStoreQuery,
          storePage: currentStorePage,
        });
      }
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setMarketId(market);
      setProductQuery(text);
      setPage(nextPage);
      setOffers([]);
      setStores((previous) =>
        previous.some((store) => store.marketId !== market) ? [] : previous,
      );
      setSelected(null);
      setSelectedStore(null);
      setStoreCartNotice(null);
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

  const loadStores = useCallback(
    async (market: number, text: string, nextPage: number, recordLocation = true) => {
      const location = readMarketLocation();
      const currentProductQuery = location.marketId === market ? location.query : "";
      const currentPage = location.marketId === market ? location.page : 0;
      if (recordLocation) {
        writeMarketLocation({
          marketId: market,
          tab: "stores",
          query: currentProductQuery,
          page: currentPage,
          offerId: null,
          storeId: null,
          storeQuery: text,
          storePage: nextPage,
        });
      }
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setMarketId(market);
      setStoreQuery(text);
      setStorePage(nextPage);
      setStores([]);
      setOffers((previous) =>
        previous.some((offer) => offer.marketId !== market) ? [] : previous,
      );
      setSelected(null);
      setSelectedStore(null);
      setStoreCartNotice(null);
      setError(null);
      setLoading(true);
      try {
        const result = await searchStores(market, text, nextPage, controller.current.signal);
        if (!mounted.current || current !== request.current) return;
        setStores(result.items);
        setStoreTotalItems(result.totalItems ?? result.items.length);
      } catch (failure) {
        if (mounted.current && current === request.current) handleError(failure);
      } finally {
        if (mounted.current && current === request.current) setLoading(false);
      }
    },
    [handleError],
  );

  const openOffer = useCallback(
    async (offer: Pick<OfferView, "marketId" | "id">, pushLocation = true) => {
      if (pushLocation) {
        const currentLoc = readMarketLocation();
        writeMarketLocation(
          {
            ...currentLoc,
            marketId: offer.marketId,
            offerId: offer.id,
          },
          true,
        );
      }
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setSelected(null);
      setSelectedStore(null);
      setStoreCartNotice(null);
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

  const openStore = useCallback(
    async (market: number, targetStoreId: number, pushLocation = true, offerPage = 0) => {
      if (pushLocation) {
        const currentLoc = readMarketLocation();
        writeMarketLocation(
          {
            ...currentLoc,
            marketId: market,
            storeId: targetStoreId,
            storeOfferPage: offerPage,
            offerId: null,
          },
          true,
        );
      }
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++request.current;
      setSelected(null);
      setSelectedStore(null);
      setStoreOffers([]);
      setStoreCartNotice(null);
      setError(null);
      setLoading(true);
      setStoreOfferLoading(true);
      try {
        const [storeDetail, offersResult] = await Promise.all([
          getMarketStore(market, targetStoreId, controller.current.signal),
          getStoreOffers(market, targetStoreId, "", offerPage, controller.current.signal),
        ]);
        if (!mounted.current || current !== request.current) return;
        setSelectedStore(storeDetail);
        setStoreOffers(offersResult.items);
        setStoreOfferTotal(offersResult.totalItems ?? offersResult.items.length);
        setStoreOfferPage(offerPage);
      } catch (failure) {
        if (mounted.current && current === request.current) handleError(failure);
      } finally {
        if (mounted.current && current === request.current) {
          setLoading(false);
          setStoreOfferLoading(false);
        }
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
      setSelectedStore(null);
      setOffers([]);
      setStores([]);
      setMarkets([]);
      setTotalItems(0);
      setStoreTotalItems(0);
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
          setStores([]);
          setTotalItems(0);
          setStoreTotalItems(0);
          setLoading(false);
        } else {
          const {
            marketId: currentMarketId,
            tab: currentTab,
            storeQuery: currentStoreQuery,
            choosingMarket: currentChoosing,
          } = marketStateRef.current;
          const targetMarket = result.find((m) => m.id === currentMarketId) ?? result[0];
          if (targetMarket) {
            if (currentTab === "stores") {
              void loadStores(targetMarket.id, currentStoreQuery, 0, !currentChoosing);
            } else {
              void loadOffers(targetMarket.id, "", 0, !currentChoosing);
            }
          }
        }
      } catch (failure) {
        if (mounted.current && current === marketRequest.current) {
          handleError(failure);
          setLoading(false);
        }
      }
    },
    [loadStores, loadOffers, handleError],
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
      if (!market) {
        setLoading(false);
        return;
      }

      setMarketId(market.id);
      setTab(location.tab ?? "offers");
      setProductQuery(location.query);
      setPage(location.page);
      setStoreQuery(location.storeQuery ?? "");
      setStorePage(location.storePage ?? 0);

      if (market.id === location.marketId && typeof location.offerId === "number") {
        await openOffer({ marketId: market.id, id: location.offerId }, false);
      } else if (market.id === location.marketId && typeof location.storeId === "number") {
        await openStore(market.id, location.storeId, false, location.storeOfferPage ?? 0);
      } else if (location.tab === "stores") {
        await loadStores(
          market.id,
          location.storeQuery ?? "",
          location.storePage ?? 0,
          location.marketId !== null,
        );
      } else {
        await loadOffers(market.id, location.query, location.page, location.marketId !== null);
      }
    } catch (failure) {
      if (mounted.current && current === request.current) {
        handleError(failure);
        setLoading(false);
      }
    }
  }, [loadOffers, loadStores, openOffer, openStore, handleError]);

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
      setMarketId(market.id);
      setTab(location.tab ?? "offers");
      setProductQuery(location.query);
      setPage(location.page);
      setStoreQuery(location.storeQuery ?? "");
      setStorePage(location.storePage ?? 0);

      if (typeof location.offerId === "number") {
        void openOffer({ marketId: market.id, id: location.offerId }, false);
      } else if (typeof location.storeId === "number") {
        void openStore(market.id, location.storeId, false, location.storeOfferPage ?? 0);
      } else if (location.tab === "stores") {
        void loadStores(market.id, location.storeQuery ?? "", location.storePage ?? 0, false);
      } else {
        void loadOffers(market.id, location.query, location.page, false);
      }
    }
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [markets, loadOffers, loadStores, openOffer, openStore]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = todayPickupDate();
      if (date !== next) {
        setDate(next);
        const {
          marketId: currentMarketId,
          selectedStore: currentStore,
          tab: currentTab,
          storeQuery: currentStoreQuery,
          productQuery: currentProductQuery,
          storeOfferPage: currentStoreOfferPage,
          choosingMarket: currentChoosing,
        } = marketStateRef.current;
        if (currentMarketId !== null) {
          if (currentStore) {
            void openStore(currentMarketId, currentStore.id, false, currentStoreOfferPage);
          } else if (currentTab === "stores") {
            void loadStores(currentMarketId, currentStoreQuery, 0, !currentChoosing);
          } else {
            void loadOffers(currentMarketId, currentProductQuery, 0, !currentChoosing);
          }
        }
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [date, openStore, loadStores, loadOffers]);

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
    if (tab === "stores") {
      void loadStores(id, "", 0, !choosingMarket);
    } else {
      void loadOffers(id, "", 0, !choosingMarket);
    }
  }

  function handleTabChange(nextTab: MarketTab) {
    ++request.current;
    controller.current?.abort();
    setLoading(false);
    setStoreOfferLoading(false);
    setError(null);
    setStoreCartNotice(null);
    setTab(nextTab);
    setSelected(null);
    setSelectedStore(null);
    if (marketId !== null) {
      if (nextTab === "stores") {
        writeMarketLocation({
          marketId,
          tab: "stores",
          query: productQuery,
          page,
          offerId: null,
          storeId: null,
          storeQuery,
          storePage,
        });
        if (stores.length === 0 || stores.some((store) => store.marketId !== marketId)) {
          void loadStores(marketId, storeQuery, storePage, false);
        }
      } else {
        writeMarketLocation({
          marketId,
          tab: "offers",
          query: productQuery,
          page,
          offerId: null,
          storeId: null,
          storeQuery,
          storePage,
        });
        if (offers.length === 0 || offers.some((offer) => offer.marketId !== marketId)) {
          void loadOffers(marketId, productQuery, page, false);
        }
      }
    }
  }

  function handleStoreBack() {
    if (hasMarketDetailHistory()) {
      window.history.back();
    } else if (marketId !== null) {
      setSelectedStore(null);
      setStoreOffers([]);
      const loc = readMarketLocation();
      if (loc.tab === "stores") {
        void loadStores(marketId, storeQuery, storePage);
      } else {
        void loadOffers(marketId, productQuery, page);
      }
    }
  }

  function handleBack() {
    if (hasMarketDetailHistory()) {
      window.history.back();
    } else if (marketId !== null) {
      setSelected(null);
      const loc = readMarketLocation();
      if (typeof loc.storeId === "number") {
        void openStore(marketId, loc.storeId, false, loc.storeOfferPage ?? 0);
      } else if (tab === "stores") {
        void loadStores(marketId, storeQuery, storePage);
      } else {
        void loadOffers(marketId, productQuery, page);
      }
    }
  }

  function handleStoreOfferAdd(offer: OfferView) {
    if (adding) return;
    const generation = request.current;
    setAdding(true);
    void putCartItem(offer, 1)
      .then(() => {
        if (mounted.current && generation === request.current) {
          setStoreCartNotice({ offerName: offer.productName });
        }
      })
      .catch((failure: unknown) => {
        if (mounted.current && generation === request.current) handleError(failure);
      })
      .finally(() => {
        if (mounted.current) setAdding(false);
      });
  }

  const { ratings, ratingLoading, ratingError, retryRatings } = useStoreRatings(
    marketId,
    choosingMarket
      ? []
      : selectedStore
        ? [selectedStore.id]
        : selected
          ? [selected.storeId]
          : tab === "stores"
            ? stores.map((store) => store.id)
            : offers.map((offer) => offer.storeId),
    onSessionExpired,
  );

  return (
    <BuyerMarketScreen
      ratings={ratings}
      ratingLoading={ratingLoading}
      ratingError={ratingError}
      onRetryRatings={retryRatings}
      choosingMarket={choosingMarket}
      onChangeMarket={() => setChoosingMarket(true)}
      onConfirmMarket={() => {
        if (marketId === null) return;
        const reload =
          selected !== null ||
          selectedStore !== null ||
          tab !== "offers" ||
          productQuery !== "" ||
          page !== 0;
        writeMarketLocation(
          {
            marketId,
            tab: "offers",
            query: "",
            page: 0,
            offerId: null,
            storeId: null,
            storeQuery: "",
            storePage: 0,
            storeOfferPage: 0,
          },
          true,
        );
        setChoosingMarket(false);
        setTab("offers");
        setStoreQuery("");
        setStorePage(0);
        if (reload) void loadOffers(marketId, "", 0, false);
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
      onSearch={(m, text) => {
        setTab("offers");
        void loadOffers(m, text, 0);
      }}
      onPage={(next) => {
        if (marketId !== null) void loadOffers(marketId, productQuery, next);
      }}
      onOpen={(offer) => void openOffer(offer)}
      onBack={handleBack}
      onAccount={onAccount}
      onRetry={() => {
        const location = readMarketLocation();
        if (marketId === null) void initialize();
        else if (typeof location.offerId === "number")
          void openOffer({ marketId, id: location.offerId }, false);
        else if (typeof location.storeId === "number")
          void openStore(marketId, location.storeId, false, location.storeOfferPage ?? 0);
        else if (tab === "stores")
          void loadStores(marketId, storeQuery, storePage, !choosingMarket);
        else void loadOffers(marketId, productQuery, page, !choosingMarket);
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
      // 매장 탭 및 매장 페이지 props
      tab={tab}
      onTabChange={handleTabChange}
      stores={stores}
      storeQuery={storeQuery}
      storePage={storePage}
      storeTotalItems={storeTotalItems}
      onStoreSearch={(m, text) => void loadStores(m, text, 0)}
      onStorePage={(next) => {
        if (marketId !== null) void loadStores(marketId, storeQuery, next);
      }}
      onOpenStore={(sId) => {
        if (marketId !== null) void openStore(marketId, sId, true);
      }}
      selectedStore={selectedStore}
      storeOffers={storeOffers}
      storeOfferPage={storeOfferPage}
      storeOfferTotal={storeOfferTotal}
      storeOfferLoading={storeOfferLoading}
      onStoreOfferPage={(next) => {
        if (marketId !== null && selectedStore !== null) {
          const currentLoc = readMarketLocation();
          writeMarketLocation(
            {
              ...currentLoc,
              marketId,
              storeId: selectedStore.id,
              storeOfferPage: next,
            },
            false,
          );
          void openStore(marketId, selectedStore.id, false, next);
        }
      }}
      onStoreBack={handleStoreBack}
      onAddStoreOffer={handleStoreOfferAdd}
      storeCartNotice={storeCartNotice}
      onClearStoreCartNotice={() => setStoreCartNotice(null)}
    />
  );
}
