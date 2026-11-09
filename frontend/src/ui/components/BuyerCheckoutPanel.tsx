import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCart,
  putCartItem,
  removeCartItem,
  clearCart,
  startCheckout,
  getCheckout,
  getOrders,
  type Cart,
  type CartItem,
  type Checkout,
  type PaymentMode,
  type PaymentInput,
} from "../../api/checkout";
import { getOffer } from "../../api/products";
import { ApiError, type OfferView } from "../../api/types";
import { purchaseQuantity } from "../../validation/checkoutValidation";
import type { DirectPurchaseLocation } from "../purchaseLocation";
import { StatusAlert } from "./StatusAlert";
import { QuantityPicker } from "./QuantityPicker";

function parsePositiveInteger(input: string): number | null {
  try {
    return purchaseQuantity(input);
  } catch {
    return null;
  }
}

interface StoreGroup {
  storeId: number;
  storeName: string;
  items: CartItem[];
}

interface MarketGroup {
  marketId: number;
  marketName: string;
  stores: StoreGroup[];
}

function groupCartItems(items: CartItem[]): MarketGroup[] {
  const marketMap = new Map<
    number,
    { marketName: string; storeMap: Map<number, { storeName: string; items: CartItem[] }> }
  >();

  for (const item of items) {
    const marketId = item.offer.marketId;
    const marketName = item.marketName || "선택한 시장";
    let marketEntry = marketMap.get(marketId);
    if (!marketEntry) {
      marketEntry = { marketName, storeMap: new Map() };
      marketMap.set(marketId, marketEntry);
    }
    const storeId = item.offer.storeId;
    const storeName = item.offer.storeName;
    let storeEntry = marketEntry.storeMap.get(storeId);
    if (!storeEntry) {
      storeEntry = { storeName, items: [] };
      marketEntry.storeMap.set(storeId, storeEntry);
    }
    storeEntry.items.push(item);
  }

  const result: MarketGroup[] = [];
  for (const [marketId, marketEntry] of marketMap.entries()) {
    const stores: StoreGroup[] = [];
    for (const [storeId, storeEntry] of marketEntry.storeMap.entries()) {
      stores.push({
        storeId,
        storeName: storeEntry.storeName,
        items: storeEntry.items,
      });
    }
    result.push({
      marketId,
      marketName: marketEntry.marketName,
      stores,
    });
  }
  return result;
}

export function BuyerCheckoutPanel({
  directPurchase,
  onCartChanged,
  onBack,
  onConfirmed,
  onSessionExpired,
}: {
  directPurchase?: DirectPurchaseLocation;
  onCartChanged?: (cart: Cart) => void;
  onBack: () => void;
  onConfirmed: (order: Checkout) => void;
  onSessionExpired: () => void;
}) {
  const isDirect = directPurchase !== undefined;
  const directMarketId = directPurchase?.marketId;
  const directOfferId = directPurchase?.offerId;
  const [cart, setCart] = useState<Cart>({ version: 0, items: [] });
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<number>>(new Set());
  const [directOffer, setDirectOffer] = useState<OfferView | null>(null);
  const [directQuantity, setDirectQuantity] = useState<string>(
    directPurchase ? String(directPurchase.quantity) : "1",
  );
  const [showMultiMarketModal, setShowMultiMarketModal] = useState(false);
  const [showClearCartModal, setShowClearCartModal] = useState(false);
  const [mode, setMode] = useState<PaymentMode>("SUCCESS");
  const [result, setResult] = useState<Checkout | null>(null);
  const [request, setRequest] = useState<PaymentInput | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [notReceived, setNotReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const active = useRef(false);
  const loadVersion = useRef(0);
  const hasInitializedSelection = useRef(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const payButton = useRef<HTMLButtonElement>(null);
  const clearCartModalRef = useRef<HTMLDialogElement>(null);
  const clearCartButton = useRef<HTMLButtonElement>(null);

  const applyCart = useCallback(
    (next: Cart, resetAllQuantities = false) => {
      setCart(next);
      onCartChanged?.(next);
      const initializeSelection = !hasInitializedSelection.current;
      hasInitializedSelection.current = true;
      setQuantities((prev) => {
        const nextQuantities: Record<number, string> = {};
        for (const item of next.items) {
          const existing = prev[item.offer.id];
          if (resetAllQuantities || existing === undefined) {
            nextQuantities[item.offer.id] = String(item.quantity);
          } else {
            nextQuantities[item.offer.id] = existing;
          }
        }
        return nextQuantities;
      });

      setSelectedOfferIds((prev) => {
        const availableItems = next.items.filter((item) => item.available);
        if (initializeSelection) {
          return new Set(availableItems.map((item) => item.offer.id));
        }
        const availableIds = new Set(availableItems.map((item) => item.offer.id));
        const retained = new Set<number>();
        for (const id of prev) {
          if (availableIds.has(id)) {
            retained.add(id);
          }
        }
        return retained;
      });
    },
    [onCartChanged],
  );

  const failure = useCallback(
    (value: unknown) => {
      if (!mounted.current) return;
      if (value instanceof ApiError && value.status === 401) onSessionExpired();
      else setError(value instanceof Error ? value.message : "요청을 처리하지 못했습니다.");
    },
    [onSessionExpired],
  );

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      if (isDirect && directMarketId !== undefined && directOfferId !== undefined) {
        const [next, history, offer] = await Promise.all([
          getCart(),
          getOrders(),
          getOffer(directMarketId, directOfferId),
        ]);
        if (!mounted.current || version !== loadVersion.current) return;
        applyCart(next, true);
        setDirectOffer(offer);
        setReady(true);
        const pending = history.find((item) => item.status === "PENDING");
        if (pending) {
          setResult(pending);
          setRequest(null);
        }
      } else {
        const [next, history] = await Promise.all([getCart(), getOrders()]);
        if (!mounted.current || version !== loadVersion.current) return;
        applyCart(next, true);
        setReady(true);
        const pending = history.find((item) => item.status === "PENDING");
        if (pending) {
          setResult(pending);
          setRequest(null);
        }
      }
    } catch (value) {
      if (version === loadVersion.current) failure(value);
    }
  }, [applyCart, directMarketId, directOfferId, failure, isDirect]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
    };
  }, [load]);

  useEffect(() => {
    if (showMultiMarketModal) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [showMultiMarketModal]);

  useEffect(() => {
    if (showClearCartModal) clearCartModalRef.current?.showModal();
    else clearCartModalRef.current?.close();
  }, [showClearCartModal]);

  const act = async (action: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (value) {
      failure(value);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const refreshResult = useCallback(
    async (key: string) => {
      try {
        const next = await getCheckout(key);
        if (!mounted.current) return;
        setResult(next);
        setUnknown(false);
        setNotReceived(false);
        setError(null);
        if (next.status === "CONFIRMED") {
          try {
            const freshCart = await getCart();
            if (mounted.current) onCartChanged?.(freshCart);
          } catch (value) {
            if (value instanceof ApiError && value.status === 401) {
              onSessionExpired();
              return;
            }
          }
          if (mounted.current) onConfirmed(next);
          return;
        }
        if (next.status !== "PENDING") {
          await load();
        }
      } catch (value) {
        if (value instanceof ApiError && value.status === 404 && mounted.current) {
          setNotReceived(true);
          setError("서버에 처리 기록이 없습니다. 같은 요청으로 재시도할 수 있습니다.");
        } else failure(value);
      }
    },
    [load, failure, onConfirmed, onCartChanged, onSessionExpired],
  );

  useEffect(() => {
    if (result?.status !== "PENDING") return;
    const timer = setTimeout(() => {
      void refreshResult(result.requestKey);
    }, 1000);
    return () => clearTimeout(timer);
  }, [result, refreshResult]);

  async function pay(input: PaymentInput) {
    setRequest(input);
    setUnknown(false);
    setNotReceived(false);
    try {
      const next = await startCheckout(input);
      if (!mounted.current) return;
      setResult(next);
      if (next.status === "CONFIRMED") {
        try {
          const freshCart = await getCart();
          if (mounted.current) onCartChanged?.(freshCart);
        } catch (value) {
          if (value instanceof ApiError && value.status === 401) {
            onSessionExpired();
            return;
          }
        }
        if (mounted.current) onConfirmed(next);
        return;
      }
      await load();
    } catch (value) {
      if (!mounted.current) return;
      if (value instanceof ApiError && [400, 403, 409].includes(value.status)) {
        failure(value);
        setRequest(null);
      } else {
        setUnknown(true);
        failure(value);
      }
    }
  }

  function handleDirectQuantityChange(val: string) {
    setDirectQuantity(val);
    const q = parsePositiveInteger(val);
    if (q !== null && directOffer && q <= directOffer.onlineQuantity && directPurchase) {
      window.history.replaceState(
        window.history.state,
        "",
        `#buy?market=${directPurchase.marketId}&offer=${directPurchase.offerId}&quantity=${q}`,
      );
    }
  }

  const pending = result?.status === "PENDING" || unknown;

  // 바로 구매는 장바구니 수량과 별도로 계산한다.
  const directQtyNumber = parsePositiveInteger(directQuantity);
  const isValidDirectQuantity =
    directOffer !== null &&
    directQtyNumber !== null &&
    directQtyNumber > 0 &&
    directQtyNumber <= directOffer.onlineQuantity;
  const directTotalWon =
    directOffer && directQtyNumber !== null
      ? BigInt(directOffer.priceWon) * BigInt(directQtyNumber)
      : 0n;

  const purchasableItems = cart.items.filter((item) => item.available);
  const selectedItems = cart.items.filter((item) => selectedOfferIds.has(item.offer.id));
  const selectedTotalWon = selectedItems.reduce((acc, item) => {
    const q = parsePositiveInteger(quantities[item.offer.id] ?? "") ?? 0;
    return acc + BigInt(item.offer.priceWon) * BigInt(q);
  }, 0n);

  const distinctMarketCount = new Set(selectedItems.map((item) => item.offer.marketId)).size;

  const isCartCheckoutInvalid =
    selectedItems.length === 0 ||
    selectedItems.length > 100 ||
    selectedItems.some((item) => {
      if (!item.available) return true;
      if (item.changed) return true;
      if (quantities[item.offer.id] !== String(item.quantity)) return true;
      const q = parsePositiveInteger(quantities[item.offer.id] ?? "");
      if (q === null) return true;
      return q > item.offer.onlineQuantity;
    });

  const cartCheckoutDisabled = !ready || busy || pending || isCartCheckoutInvalid;

  const directCheckoutDisabled =
    !ready ||
    busy ||
    pending ||
    !directOffer ||
    !isValidDirectQuantity ||
    directOffer.onlineQuantity === 0;

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedOfferIds(new Set(purchasableItems.map((item) => item.offer.id)));
    } else {
      setSelectedOfferIds(new Set());
    }
  }

  function toggleSelectMarket(marketItems: CartItem[], checked: boolean) {
    const purchasable = marketItems.filter((item) => item.available);
    setSelectedOfferIds((prev) => {
      const next = new Set(prev);
      for (const item of purchasable) {
        if (checked) next.add(item.offer.id);
        else next.delete(item.offer.id);
      }
      return next;
    });
  }

  function toggleSelectStore(storeItems: CartItem[], checked: boolean) {
    const purchasable = storeItems.filter((item) => item.available);
    setSelectedOfferIds((prev) => {
      const next = new Set(prev);
      for (const item of purchasable) {
        if (checked) next.add(item.offer.id);
        else next.delete(item.offer.id);
      }
      return next;
    });
  }

  function toggleSelectItem(offerId: number, checked: boolean) {
    setSelectedOfferIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(offerId);
      else next.delete(offerId);
      return next;
    });
  }

  async function executeCartCheckout() {
    const offerIds = selectedItems.map((item) => item.offer.id);
    await pay({
      requestKey: crypto.randomUUID(),
      cartVersion: cart.version,
      mode,
      offerIds,
    });
  }

  async function executeDirectCheckout() {
    if (!directOffer || !directPurchase || directQtyNumber === null) return;
    await pay({
      requestKey: crypto.randomUUID(),
      cartVersion: cart.version,
      mode,
      directItem: {
        offerId: directOffer.id,
        quantity: directQtyNumber,
        expectedPrice: directOffer.priceWon,
        startTime: directOffer.startTime,
        endTime: directOffer.endTime,
        orderDeadline: directOffer.orderDeadline,
      },
    });
  }

  function handleCartCheckoutClick() {
    if (distinctMarketCount >= 2) {
      setShowMultiMarketModal(true);
      return;
    }
    void act(executeCartCheckout);
  }

  const marketGroups = groupCartItems(cart.items);

  return (
    <section className="hybrid-card checkout-workspace" aria-labelledby="checkout-heading">
      <header className="summary-card-header">
        <button className="text-action-link" disabled={busy || pending} onClick={onBack}>
          ← 시장 상품으로
        </button>
        <h1 id="checkout-heading">{isDirect ? "주문 확인" : "장바구니"}</h1>
        <p>결제 확정 시 재고를 확인합니다. 먼저 결제에 성공한 구매자가 상품을 구매합니다.</p>
      </header>

      <div className="summary-card-body">
        <StatusAlert message={error} onRetry={!ready ? () => void act(load) : undefined} />
        {isDirect && ready && (
          <button
            type="button"
            className="text-action-link"
            disabled={busy || pending}
            onClick={() => void act(load)}
          >
            상품 정보 새로고침
          </button>
        )}

        {isDirect ? (
          /* 바로 구매 (독립 주문 확인) 화면 */
          <>
            {!ready && <p role="status">주문 정보를 불러오고 있습니다.</p>}
            {ready && directOffer && (
              <article className="checkout-item" key={directOffer.id}>
                <h2>{directOffer.productName}</h2>
                <p>
                  {directOffer.storeName} · {directOffer.unitAmount.toLocaleString()}
                  {directOffer.unitType === "WEIGHT" ? "g" : "개"} / 포장
                </p>
                <p>
                  {directOffer.priceWon.toLocaleString()}원 / 포장 · {directOffer.pickupDate} · 수령{" "}
                  {directOffer.startTime.slice(0, 5)}~{directOffer.endTime.slice(0, 5)} · 주문 마감{" "}
                  {directOffer.orderDeadline.slice(0, 5)}
                </p>
                {directOffer.onlineQuantity === 0 && (
                  <p role="alert">품절로 인해 주문할 수 없습니다.</p>
                )}
                {directQtyNumber === null && (
                  <p role="alert">구매 수량은 양의 정수로 입력해 주세요.</p>
                )}
                {directOffer.onlineQuantity > 0 &&
                  directQtyNumber !== null &&
                  directQtyNumber > directOffer.onlineQuantity && (
                    <p role="alert">
                      잔여 수량이 부족합니다. (현재 잔여{" "}
                      {directOffer.onlineQuantity.toLocaleString()}포장)
                    </p>
                  )}
                <label className="field-label" htmlFor="direct-quantity">
                  구매 수량
                </label>
                <div className="checkout-actions">
                  <QuantityPicker
                    id="direct-quantity"
                    label="구매 수량"
                    value={directQuantity}
                    maximum={directOffer.onlineQuantity}
                    disabled={busy || pending || directOffer.onlineQuantity === 0}
                    onChange={handleDirectQuantityChange}
                  />
                  <p className="checkout-item-total">
                    상품 금액 <strong>{directTotalWon.toLocaleString()}원</strong>
                  </p>
                </div>
              </article>
            )}

            {ready && directOffer && (
              <div className="checkout-payment">
                <p>
                  총 결제금액 {directTotalWon.toLocaleString()}원 · 모의 결제이며 실제 금액은
                  청구하지 않습니다.
                </p>
                <p>결제한 가격과 매장별 수령 조건은 주문에 고정됩니다.</p>
                <div className="checkout-notice-box" role="note" id="checkoutPickupNotice">
                  <p>
                    <strong>수령 및 취소 안내</strong>
                  </p>
                  <ul>
                    <li>매장별 수령 시간 및 일반 취소 마감 시각을 확인해 주세요.</li>
                    <li>일반 취소는 각 매장의 주문 마감 전까지만 가능합니다.</li>
                    <li>
                      수령 마감 정각까지 찾아가지 않은 구매자 미수령 건은 자동 환불되지 않습니다.
                    </li>
                  </ul>
                </div>
                <label className="field-label" htmlFor="payment-mode">
                  모의 결제 결과
                </label>
                <select
                  className="input-box"
                  id="payment-mode"
                  value={mode}
                  disabled={busy || pending}
                  onChange={(event) => setMode(event.target.value as PaymentMode)}
                >
                  <option value="SUCCESS">성공</option>
                  <option value="FAIL">실패</option>
                  <option value="DELAY">3초 지연 후 처리</option>
                  <option value="LOST_RESPONSE">성공 후 응답 유실</option>
                </select>
                <button
                  className="btn-query-store"
                  disabled={directCheckoutDisabled}
                  onClick={() => void act(executeDirectCheckout)}
                >
                  통합 모의 결제
                </button>
              </div>
            )}
          </>
        ) : (
          /* 일반 장바구니 화면 */
          <>
            <div className="checkout-actions">
              <button
                className="text-action-link"
                disabled={busy || pending}
                onClick={() => void act(load)}
              >
                장바구니 새로고침
              </button>
              <button
                className="text-action-link"
                disabled={busy || pending || cart.items.length === 0}
                ref={clearCartButton}
                onClick={() => setShowClearCartModal(true)}
              >
                장바구니 비우기
              </button>
            </div>

            {!ready && <p role="status">장바구니를 불러오고 있습니다.</p>}
            {ready && cart.items.length === 0 && (
              <p>장바구니가 비어 있습니다. 시장 상품에서 담아 주세요.</p>
            )}

            {ready && cart.items.length > 0 && (
              <div className="cart-select-all-row">
                <label className="checkbox-label" htmlFor="cart-select-all">
                  <input
                    type="checkbox"
                    id="cart-select-all"
                    aria-label="전체 상품 선택"
                    ref={(node) => {
                      if (node)
                        node.indeterminate =
                          purchasableItems.some((item) => selectedOfferIds.has(item.offer.id)) &&
                          !purchasableItems.every((item) => selectedOfferIds.has(item.offer.id));
                    }}
                    checked={
                      purchasableItems.length > 0 &&
                      selectedOfferIds.size >= purchasableItems.length &&
                      purchasableItems.every((item) => selectedOfferIds.has(item.offer.id))
                    }
                    disabled={busy || pending || purchasableItems.length === 0}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                  <span>
                    전체 선택 ({selectedItems.length}/{purchasableItems.length})
                  </span>
                </label>
              </div>
            )}

            {marketGroups.map((market) => {
              const marketPurchasable = market.stores
                .flatMap((s) => s.items)
                .filter((i) => i.available);
              const isMarketAllSelected =
                marketPurchasable.length > 0 &&
                marketPurchasable.every((i) => selectedOfferIds.has(i.offer.id));

              return (
                <section className="checkout-market-group" key={market.marketId}>
                  <div className="checkout-market-header">
                    <label className="checkbox-label" htmlFor={`market-select-${market.marketId}`}>
                      <input
                        type="checkbox"
                        id={`market-select-${market.marketId}`}
                        aria-label={`${market.marketName} 전체 선택`}
                        ref={(node) => {
                          if (node)
                            node.indeterminate =
                              !isMarketAllSelected &&
                              marketPurchasable.some((item) => selectedOfferIds.has(item.offer.id));
                        }}
                        checked={isMarketAllSelected}
                        disabled={busy || pending || marketPurchasable.length === 0}
                        onChange={(e) =>
                          toggleSelectMarket(
                            market.stores.flatMap((s) => s.items),
                            e.target.checked,
                          )
                        }
                      />
                      <h2>{market.marketName}</h2>
                    </label>
                  </div>

                  {market.stores.map((store) => {
                    const storePurchasable = store.items.filter((i) => i.available);
                    const isStoreAllSelected =
                      storePurchasable.length > 0 &&
                      storePurchasable.every((i) => selectedOfferIds.has(i.offer.id));

                    return (
                      <div className="checkout-store-group" key={store.storeId}>
                        <div className="checkout-store-header">
                          <label
                            className="checkbox-label"
                            htmlFor={`store-select-${store.storeId}`}
                          >
                            <input
                              type="checkbox"
                              id={`store-select-${store.storeId}`}
                              aria-label={`${store.storeName} 전체 선택`}
                              ref={(node) => {
                                if (node)
                                  node.indeterminate =
                                    !isStoreAllSelected &&
                                    storePurchasable.some((item) =>
                                      selectedOfferIds.has(item.offer.id),
                                    );
                              }}
                              checked={isStoreAllSelected}
                              disabled={busy || pending || storePurchasable.length === 0}
                              onChange={(e) => toggleSelectStore(store.items, e.target.checked)}
                            />
                            <h3>{store.storeName}</h3>
                          </label>
                        </div>

                        {store.items.map((item) => {
                          const isSelected = selectedOfferIds.has(item.offer.id);
                          const inputQtyStr = quantities[item.offer.id] ?? String(item.quantity);
                          const parsedItemQty = parsePositiveInteger(inputQtyStr) ?? 0;
                          const itemTotalWon = BigInt(item.offer.priceWon) * BigInt(parsedItemQty);
                          const isQuantityUnapplied = inputQtyStr !== String(item.quantity);
                          const isInputValid = parsePositiveInteger(inputQtyStr) !== null;

                          return (
                            <article className="checkout-item" key={item.offer.id}>
                              <div className="checkout-item-header">
                                <label
                                  className="checkbox-label"
                                  htmlFor={`cart-item-${item.offer.id}`}
                                >
                                  <input
                                    type="checkbox"
                                    id={`cart-item-${item.offer.id}`}
                                    aria-label={`${item.offer.productName} 선택`}
                                    checked={isSelected}
                                    disabled={busy || pending || !item.available}
                                    onChange={(e) =>
                                      toggleSelectItem(item.offer.id, e.target.checked)
                                    }
                                  />
                                  <h4>{item.offer.productName}</h4>
                                </label>
                              </div>

                              <p>
                                {item.offer.storeName} · {item.offer.unitAmount.toLocaleString()}
                                {item.offer.unitType === "WEIGHT" ? "g" : "개"} / 포장
                              </p>
                              <p>
                                {item.offer.priceWon.toLocaleString()}원 / 포장 ·{" "}
                                {item.offer.pickupDate} · 수령 {item.offer.startTime.slice(0, 5)}~
                                {item.offer.endTime.slice(0, 5)} · 주문 마감{" "}
                                {item.offer.orderDeadline.slice(0, 5)}
                              </p>

                              {!item.available && (
                                <>
                                  {item.offer.onlineQuantity === 0 ? (
                                    <p role="alert">품절로 인해 주문할 수 없습니다.</p>
                                  ) : item.offer.onlineQuantity < item.quantity ? (
                                    <p role="alert">
                                      잔여 수량이 부족합니다. (현재 잔여{" "}
                                      {item.offer.onlineQuantity.toLocaleString()}포장)
                                    </p>
                                  ) : (
                                    <p role="alert">
                                      판매 중단·삭제·마감 또는 날짜 경과로 주문할 수 없습니다.
                                    </p>
                                  )}
                                </>
                              )}

                              {item.changed && (
                                <p role="alert">
                                  가격·수령 조건이 변경되었습니다. 현재 조건을 확인한 뒤 아래 버튼을
                                  눌러 주세요.
                                </p>
                              )}

                              <label
                                className="field-label"
                                htmlFor={`cart-quantity-${item.offer.id}`}
                              >
                                구매 수량
                              </label>
                              {!isInputValid && (
                                <p role="alert">구매 수량은 양의 정수로 입력해 주세요.</p>
                              )}
                              <div className="checkout-actions">
                                <QuantityPicker
                                  id={`cart-quantity-${item.offer.id}`}
                                  label="구매 수량"
                                  value={inputQtyStr}
                                  maximum={item.offer.onlineQuantity}
                                  disabled={busy || pending || item.offer.onlineQuantity === 0}
                                  onChange={(val) =>
                                    setQuantities((previous) => ({
                                      ...previous,
                                      [item.offer.id]: val,
                                    }))
                                  }
                                />
                                <button
                                  className="btn-query-store"
                                  disabled={
                                    busy ||
                                    pending ||
                                    !isInputValid ||
                                    parsedItemQty > item.offer.onlineQuantity ||
                                    item.offer.onlineQuantity === 0 ||
                                    (!isQuantityUnapplied && !item.changed)
                                  }
                                  onClick={() =>
                                    void act(async () => {
                                      const q = purchaseQuantity(inputQtyStr);
                                      const nextCart = await putCartItem(item.offer, q);
                                      applyCart(nextCart);
                                      onCartChanged?.(nextCart);
                                      setQuantities((prev) => ({
                                        ...prev,
                                        [item.offer.id]: String(q),
                                      }));
                                      setResult(null);
                                      setRequest(null);
                                    })
                                  }
                                >
                                  {item.changed ? "변경 조건 확인·수량 적용" : "수량 적용"}
                                </button>
                                <button
                                  className="text-action-link"
                                  disabled={busy || pending}
                                  onClick={() =>
                                    void act(async () => {
                                      const nextCart = await removeCartItem(item.offer.id);
                                      applyCart(nextCart);
                                      onCartChanged?.(nextCart);
                                      setSelectedOfferIds((prev) => {
                                        const next = new Set(prev);
                                        next.delete(item.offer.id);
                                        return next;
                                      });
                                    })
                                  }
                                >
                                  삭제
                                </button>
                                <p className="checkout-item-total">
                                  상품 금액 <strong>{itemTotalWon.toLocaleString()}원</strong>
                                </p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    );
                  })}
                </section>
              );
            })}

            {cart.items.length > 0 && (
              <div className="checkout-payment">
                <p>
                  총 결제금액 {selectedTotalWon.toLocaleString()}원 · 모의 결제이며 실제 금액은
                  청구하지 않습니다.
                </p>
                <p>결제한 가격과 매장별 수령 조건은 주문에 고정됩니다.</p>
                <div className="checkout-notice-box" role="note" id="checkoutPickupNotice">
                  <p>
                    <strong>수령 및 취소 안내</strong>
                  </p>
                  <ul>
                    <li>매장별 수령 시간 및 일반 취소 마감 시각을 확인해 주세요.</li>
                    <li>일반 취소는 각 매장의 주문 마감 전까지만 가능합니다.</li>
                    <li>
                      수령 마감 정각까지 찾아가지 않은 구매자 미수령 건은 자동 환불되지 않습니다.
                    </li>
                  </ul>
                </div>
                <label className="field-label" htmlFor="payment-mode">
                  모의 결제 결과
                </label>
                <select
                  className="input-box"
                  id="payment-mode"
                  value={mode}
                  disabled={busy || pending}
                  onChange={(event) => setMode(event.target.value as PaymentMode)}
                >
                  <option value="SUCCESS">성공</option>
                  <option value="FAIL">실패</option>
                  <option value="DELAY">3초 지연 후 처리</option>
                  <option value="LOST_RESPONSE">성공 후 응답 유실</option>
                </select>
                <button
                  ref={payButton}
                  className="btn-query-store"
                  disabled={cartCheckoutDisabled}
                  onClick={handleCartCheckoutClick}
                >
                  통합 모의 결제
                </button>
              </div>
            )}
          </>
        )}

        {(unknown || result?.status === "PENDING") && (
          <p role="status">결제 결과 확인 중입니다. 새 결제를 시작하지 마세요.</p>
        )}
        {(unknown || result?.status === "PENDING") && (
          <button
            className="btn-query-store"
            disabled={busy}
            onClick={() => {
              const key = request?.requestKey ?? result?.requestKey;
              if (key) void act(() => refreshResult(key));
            }}
          >
            결제 결과 확인
          </button>
        )}
        {notReceived && request && (
          <button
            className="text-action-link"
            disabled={busy}
            onClick={() => void act(() => pay(request))}
          >
            같은 결제 요청으로 재시도
          </button>
        )}
        {result?.status === "FAILED" && <p role="alert">결제 실패: {result.message}</p>}
        {result?.status === "CONFIRMED" && (
          <p role="status">
            결제가 완료되었습니다. 주문 번호 {result.id} ·{" "}
            {BigInt(result.totalWon).toLocaleString()}원
          </p>
        )}
      </div>

      <dialog
        className="hybrid-card multi-market-confirm-modal"
        aria-labelledby="clear-cart-dialog-title"
        aria-describedby="clear-cart-dialog-desc"
        ref={clearCartModalRef}
        onCancel={() => setShowClearCartModal(false)}
        onClose={() => {
          setShowClearCartModal(false);
          clearCartButton.current?.focus();
        }}
      >
        <header className="summary-card-header">
          <h3 id="clear-cart-dialog-title">장바구니를 비울까요?</h3>
        </header>
        <div className="summary-card-body">
          <p id="clear-cart-dialog-desc">장바구니에 담긴 모든 상품이 삭제됩니다.</p>
          <div className="checkout-actions">
            <button
              type="button"
              className="text-action-link"
              onClick={() => setShowClearCartModal(false)}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-query-store"
              disabled={busy || pending}
              onClick={() => {
                setShowClearCartModal(false);
                void act(async () => {
                  const emptyCart = await clearCart();
                  applyCart(emptyCart, true);
                  setSelectedOfferIds(new Set());
                });
              }}
            >
              확인
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        className="hybrid-card multi-market-confirm-modal"
        aria-labelledby="multi-market-dialog-title"
        ref={modalRef}
        onCancel={() => setShowMultiMarketModal(false)}
        onClose={() => {
          setShowMultiMarketModal(false);
          payButton.current?.focus();
        }}
      >
        <header className="summary-card-header">
          <h3 id="multi-market-dialog-title">여러 시장 상품 동시 주문 확인</h3>
        </header>
        <div className="summary-card-body">
          <p id="multi-market-dialog-desc">
            {distinctMarketCount}개 시장의 상품을 함께 주문합니다. 상품은 각 매장에서 직접 수령해야
            합니다.
          </p>
          <div className="checkout-actions">
            <button
              type="button"
              className="btn-query-store"
              id="btnConfirmMultiMarket"
              disabled={busy || pending}
              onClick={() => {
                setShowMultiMarketModal(false);
                void act(executeCartCheckout);
              }}
            >
              결제 계속하기
            </button>
            <button
              type="button"
              className="text-action-link"
              id="btnCancelMultiMarket"
              disabled={busy || pending}
              onClick={() => setShowMultiMarketModal(false)}
            >
              돌아가기
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
