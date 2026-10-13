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
  type Checkout,
  type PaymentMode,
  type PaymentInput,
} from "../../api/checkout";
import { ApiError } from "../../api/types";
import { purchaseQuantity } from "../../validation/checkoutValidation";
import { StatusAlert } from "./StatusAlert";
export function BuyerCheckoutPanel({
  onBack,
  onSessionExpired,
}: {
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [cart, setCart] = useState<Cart>({ version: 0, items: [] });
  const [orders, setOrders] = useState<Checkout[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
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
  const applyCart = useCallback((next: Cart) => {
    setCart(next);
    setQuantities(
      Object.fromEntries(next.items.map((item) => [item.offer.id, String(item.quantity)])),
    );
  }, []);
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
      const [next, history] = await Promise.all([getCart(), getOrders()]);
      if (!mounted.current || version !== loadVersion.current) return;
      applyCart(next);
      setOrders(history);
      setReady(true);
      const pending = history.find((item) => item.status === "PENDING");
      if (pending) {
        setResult(pending);
        setRequest(null);
      }
    } catch (value) {
      if (version === loadVersion.current) failure(value);
    }
  }, [applyCart, failure]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
    };
  }, [load]);
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
    [load, failure],
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
  const pending = result?.status === "PENDING" || unknown;
  const changed = cart.items.some((item) => item.changed || !item.available);
  return (
    <section className="hybrid-card checkout-workspace" aria-labelledby="checkout-heading">
      <header className="summary-card-header">
        <button className="text-action-link" disabled={busy || pending} onClick={onBack}>
          ← 시장 상품으로
        </button>
        <h1 id="checkout-heading">장바구니와 주문 내역</h1>
        <p>결제 확정 시 재고를 확인합니다. 먼저 결제에 성공한 구매자가 상품을 구매합니다.</p>
      </header>
      <div className="summary-card-body">
        <StatusAlert message={error} />
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
            onClick={() =>
              void act(async () => {
                applyCart(await clearCart());
              })
            }
          >
            장바구니 비우기
          </button>
        </div>
        {!ready && <p role="status">장바구니를 불러오고 있습니다.</p>}
        {ready && cart.items.length === 0 && (
          <p>장바구니가 비어 있습니다. 시장 상품에서 담아 주세요.</p>
        )}
        {cart.items.map((item) => (
          <article className="checkout-item" key={item.offer.id}>
            <h2>{item.offer.productName}</h2>
            <p>
              {item.offer.storeName} · {item.offer.unitAmount.toLocaleString()}
              {item.offer.unitType === "WEIGHT" ? "g" : "개"} / 포장
            </p>
            <p>
              {item.offer.priceWon.toLocaleString()}원 / 포장 · {item.offer.pickupDate} · 수령{" "}
              {item.offer.startTime.slice(0, 5)}~{item.offer.endTime.slice(0, 5)} · 주문 마감{" "}
              {item.offer.orderDeadline.slice(0, 5)}
            </p>
            {!item.available && (
              <p role="alert">판매 중단·삭제·마감 또는 날짜 경과로 주문할 수 없습니다.</p>
            )}
            {item.changed && (
              <p role="alert">
                가격·수령 조건이 변경되었습니다. 현재 조건을 확인한 뒤 아래 버튼을 눌러 주세요.
              </p>
            )}
            <label className="field-label" htmlFor={`cart-quantity-${item.offer.id}`}>
              구매 수량
            </label>
            <div className="checkout-actions">
              <input
                className="input-box"
                id={`cart-quantity-${item.offer.id}`}
                inputMode="numeric"
                value={quantities[item.offer.id] ?? ""}
                disabled={busy || pending}
                onChange={(event) =>
                  setQuantities((previous) => ({
                    ...previous,
                    [item.offer.id]: event.target.value,
                  }))
                }
              />
              <button
                className="btn-query-store"
                disabled={busy || pending || !item.available}
                onClick={() =>
                  void act(async () => {
                    applyCart(
                      await putCartItem(
                        item.offer,
                        purchaseQuantity(quantities[item.offer.id] ?? ""),
                      ),
                    );
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
                    applyCart(await removeCartItem(item.offer.id));
                  })
                }
              >
                삭제
              </button>
            </div>
          </article>
        ))}
        {cart.items.length > 0 && (
          <div className="checkout-payment">
            <p>
              총{" "}
              {cart.items
                .reduce(
                  (total, item) => total + BigInt(item.offer.priceWon) * BigInt(item.quantity),
                  0n,
                )
                .toLocaleString()}
              원 · 모의 결제이며 실제 금액은 청구하지 않습니다.
            </p>
            <p>결제한 가격과 매장별 수령 조건은 주문에 고정됩니다.</p>
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
              disabled={
                !ready ||
                busy ||
                pending ||
                changed ||
                cart.items.some((item) => String(item.quantity) !== quantities[item.offer.id])
              }
              onClick={() =>
                void act(() =>
                  pay({ requestKey: crypto.randomUUID(), cartVersion: cart.version, mode }),
                )
              }
            >
              통합 모의 결제
            </button>
          </div>
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
        <h2>매장별 주문 내역</h2>
        <button className="text-action-link" disabled={busy} onClick={() => void act(load)}>
          주문 내역 새로고침
        </button>
        {orders.filter((order) => order.status === "CONFIRMED").length === 0 && (
          <p>아직 확정된 주문이 없습니다.</p>
        )}
        {orders
          .filter((order) => order.status === "CONFIRMED")
          .map((order) => (
            <article className="checkout-order" key={order.id}>
              <h3>
                통합 주문 {order.id} · {BigInt(order.totalWon).toLocaleString()}원
              </h3>
              {order.storeOrders.map((store) => (
                <section key={store.id}>
                  <h4>
                    {store.storeName} · 매장 주문 {store.id}
                  </h4>
                  <p>
                    {store.pickupDate} 수령 {store.startTime.slice(0, 5)}~
                    {store.endTime.slice(0, 5)}
                  </p>
                  <ul>
                    {store.items.map((item, index) => (
                      <li key={index}>
                        {item.productName} · {item.unitAmount}
                        {item.unitType === "WEIGHT" ? "g" : "개"} 포장 × {item.quantity} ·{" "}
                        {item.priceWon.toLocaleString()}원 / 포장
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          ))}
      </div>
    </section>
  );
}
