import { useCallback, useEffect, useRef, useState } from "react";
import { getOrders, type Checkout } from "../../api/checkout";
import { ApiError } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

export function BuyerOrdersPanel({
  completedOrder,
  onBack,
  onCart,
  onSessionExpired,
}: {
  completedOrder: Checkout | null;
  onBack: () => void;
  onCart: () => void;
  onSessionExpired: () => void;
}) {
  const [orders, setOrders] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const history = await getOrders();
      if (!mounted.current || current !== request.current) return;
      setOrders(history.filter((order) => order.status === "CONFIRMED"));
    } catch (value) {
      if (!mounted.current || current !== request.current) return;
      if (value instanceof ApiError && value.status === 401) onSessionExpired();
      else setError(value instanceof Error ? value.message : "주문 내역을 불러오지 못했습니다.");
    } finally {
      if (mounted.current && current === request.current) setLoading(false);
    }
  }, [onSessionExpired]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [load]);

  return (
    <section className="hybrid-card checkout-workspace" aria-labelledby="orders-heading">
      <header className="summary-card-header">
        <nav className="checkout-actions" aria-label="구매 메뉴">
          <button className="text-action-link" onClick={onBack}>
            ← 시장 상품으로
          </button>
          <button className="text-action-link" onClick={onCart}>
            장바구니
          </button>
        </nav>
        <h1 id="orders-heading">주문 내역</h1>
        <p>구매한 상품과 매장별 수령 정보를 확인하세요.</p>
      </header>
      <div className="summary-card-body">
        {completedOrder && (
          <p role="status">
            결제가 완료되었습니다. 주문 번호 {completedOrder.id} ·{" "}
            {BigInt(completedOrder.totalWon).toLocaleString()}원
          </p>
        )}
        <StatusAlert message={error} onRetry={() => void load()} />
        <button className="text-action-link" disabled={loading} onClick={() => void load()}>
          주문 내역 새로고침
        </button>
        {loading && <p role="status">주문 내역을 불러오고 있습니다.</p>}
        {!loading && !error && orders.length === 0 && (
          <div className="market-empty">
            <h2>아직 확정된 주문이 없습니다.</h2>
            <p>시장 상품을 둘러보고 장바구니에서 결제해 주세요.</p>
            <button className="btn-query-store" onClick={onBack}>
              시장 상품 둘러보기
            </button>
          </div>
        )}
        {orders.map((order) => (
          <article className="checkout-order" key={order.id}>
            <h2>
              통합 주문 {order.id} · {BigInt(order.totalWon).toLocaleString()}원
            </h2>
            {order.storeOrders.map((store) => (
              <section key={store.id}>
                <h3>
                  {store.storeName} · 매장 주문 {store.id}
                </h3>
                <p>
                  {store.pickupDate} 수령 {store.startTime.slice(0, 5)}~{store.endTime.slice(0, 5)}
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
