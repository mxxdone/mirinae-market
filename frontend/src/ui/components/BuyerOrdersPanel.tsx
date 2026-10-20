import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { getOrders, type Checkout } from "../../api/checkout";
import {
  cancelBuyerStoreOrder,
  formatRefundStatus,
  formatStoreOrderStatus,
  type CancellationKind,
  type StoreOrderView,
} from "../../api/operations";
import { ApiError } from "../../api/types";
import { BuyerStoreReportModal } from "./BuyerStoreReportModal";
import { OrderStatementModal } from "./OrderStatementModal";
import { StatusAlert } from "./StatusAlert";

interface Props {
  completedOrder: Checkout | null;
  onBack: () => void;
  onCart: () => void;
  onSessionExpired: () => void;
}

interface FailedCancellation {
  storeOrderId: number;
  requestKey: string;
  kind: CancellationKind;
  errorMessage: string;
}

export function BuyerOrdersPanel({
  completedOrder,
  onBack,
  onCart,
  onSessionExpired,
}: Props): ReactElement {
  const [orders, setOrders] = useState<Checkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 취소 확인 및 실행 상태
  const [confirmingCancel, setConfirmingCancel] = useState<{
    storeOrderId: number;
    storeName: string;
    kind: CancellationKind;
    requestKey: string;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [failedCancel, setFailedCancel] = useState<FailedCancellation | null>(null);

  // 매장 제보 모달 상태
  const [reportingStore, setReportingStore] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // 모의 결제 내역서 모달 상태
  const [viewingStatementId, setViewingStatementId] = useState<number | null>(null);

  const request = useRef(0);
  const mutating = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (mutating.current) return;
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

  async function executeCancel(storeOrderId: number, requestKey: string, kind: CancellationKind) {
    mutating.current = true;
    request.current += 1;
    setLoading(false);
    setIsCancelling(true);
    setError(null);
    setNotice(null);
    setFailedCancel(null);

    try {
      const updated = await cancelBuyerStoreOrder(storeOrderId, { requestKey, kind });
      if (!mounted.current) return;
      // 상태 반영: orders 목록 내 해당 매장 주문 갱신
      setOrders((prev) =>
        prev.map((order) => ({
          ...order,
          storeOrders: order.storeOrders.map((store) =>
            store.id === storeOrderId ? updated : store,
          ),
        })),
      );
      setNotice(
        kind === "GENERAL"
          ? "매장 주문이 취소되었습니다. 환불 진행 내역을 확인해 주세요."
          : "남은 상품 취소가 완료되었습니다. 환불 진행 내역을 확인해 주세요.",
      );
      setConfirmingCancel(null);
    } catch (err: unknown) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : "취소 요청을 전송하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
      setError(msg);
      // 명시적 재시도를 위해 같은 requestKey와 kind를 보존
      setFailedCancel({
        storeOrderId,
        requestKey,
        kind,
        errorMessage: msg,
      });
    } finally {
      mutating.current = false;
      if (mounted.current) setIsCancelling(false);
    }
  }

  function startCancel(store: StoreOrderView, kind: CancellationKind) {
    setError(null);
    setNotice(null);
    setFailedCancel(null);
    setConfirmingCancel({
      storeOrderId: store.id,
      storeName: store.storeName,
      kind,
      requestKey: crypto.randomUUID(),
    });
  }

  return (
    <section className="hybrid-card checkout-workspace" aria-labelledby="orders-heading">
      <header className="summary-card-header">
        <nav className="checkout-actions" aria-label="구매 메뉴">
          <button className="text-action-link" onClick={onBack} disabled={isCancelling}>
            ← 시장 상품으로
          </button>
          <button className="text-action-link" onClick={onCart} disabled={isCancelling}>
            장바구니
          </button>
        </nav>
        <h1 id="orders-heading">주문 내역</h1>
        <p>구매한 상품과 매장별 수령 코드, 취소 및 환불 상태를 확인하세요.</p>
      </header>
      <div className="summary-card-body">
        {completedOrder && (
          <p role="status" className="notice-text">
            결제가 완료되었습니다. 주문 번호 {completedOrder.id} ·{" "}
            {BigInt(completedOrder.totalWon).toLocaleString()}원
          </p>
        )}
        {notice && (
          <p role="status" className="notice-text" id="buyerOrderNotice">
            {notice}
          </p>
        )}
        <StatusAlert message={error} onRetry={() => void load()} />

        {failedCancel && (
          <div className="status-alert-box alert-warning" role="alert">
            <p>취소 요청 처리 중 오류가 발생했습니다: {failedCancel.errorMessage}</p>
            <div className="checkout-actions">
              <button
                type="button"
                className="btn-query-store"
                id="btnRetryCancellation"
                disabled={isCancelling}
                onClick={() =>
                  void executeCancel(
                    failedCancel.storeOrderId,
                    failedCancel.requestKey,
                    failedCancel.kind,
                  )
                }
              >
                {isCancelling ? "재시도 중..." : "같은 요청으로 재시도"}
              </button>
              <button
                type="button"
                className="text-action-link"
                disabled={isCancelling}
                onClick={() => void load()}
              >
                주문 상태 새로고침
              </button>
            </div>
          </div>
        )}

        <button
          className="text-action-link"
          disabled={loading || isCancelling}
          onClick={() => void load()}
          id="btnRefreshOrders"
        >
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
            <div className="checkout-order-header">
              <h2>
                통합 주문 {order.id} · {BigInt(order.totalWon).toLocaleString()}원
              </h2>
              <button
                type="button"
                className="btn-query-store btn-order-statement"
                id={`btnOrderStatement-${order.id}`}
                disabled={isCancelling}
                onClick={() => setViewingStatementId(order.id)}
              >
                모의 결제 내역서
              </button>
            </div>
            {order.storeOrders.map((store) => (
              <section key={store.id} className="store-order-card" data-store-order-id={store.id}>
                <div className="store-order-header">
                  <h3>
                    {store.storeName} · 매장 주문 {store.id}
                  </h3>
                  <div className="store-order-tags">
                    <span
                      className={`badge-tag badge-${store.status.toLowerCase()}`}
                      id={`storeOrderStatus-${store.id}`}
                    >
                      {formatStoreOrderStatus(store.status)}
                    </span>
                    <button
                      type="button"
                      className="text-action-link btn-report-store"
                      id={`btnReportStore-${store.id}`}
                      disabled={isCancelling}
                      onClick={() =>
                        setReportingStore({
                          id: store.storeId,
                          name: store.storeName,
                        })
                      }
                    >
                      매장 제보
                    </button>
                  </div>
                </div>

                {store.pickupCode && (
                  <p className="pickup-code-box" id={`pickupCode-${store.id}`}>
                    수령 코드: <strong>{store.pickupCode}</strong>
                  </p>
                )}

                <p className="store-pickup-window">
                  {store.pickupDate} 수령 {store.startTime.slice(0, 5)}~{store.endTime.slice(0, 5)}{" "}
                  · 주문 마감 {store.orderDeadline.slice(0, 5)}
                </p>

                <ul className="store-order-items">
                  {store.items.map((item) => (
                    <li
                      key={item.id}
                      className={`store-order-item ${item.cancelled ? "item-cancelled" : ""}`}
                    >
                      <div className="item-main-info">
                        <strong>{item.productName}</strong> · {item.unitAmount}
                        {item.unitType === "WEIGHT" ? "g" : "개"} 포장 × {item.quantity} ·{" "}
                        {item.priceWon.toLocaleString()}원 / 포장
                        {item.cancelled && <span className="badge-cancelled">취소됨</span>}
                      </div>
                      {item.cancelled && (
                        <p className="item-cancel-reason">
                          취소 사유:{" "}
                          {item.cancellationReason || item.cancellationType || "판매 취소"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                {/* 취소 및 환불 금액 요약 */}
                {(BigInt(store.cancelledWon || "0") > 0n ||
                  BigInt(store.refundedWon || "0") > 0n ||
                  (store.refunds && store.refunds.length > 0)) && (
                  <div className="store-refund-summary">
                    {BigInt(store.cancelledWon || "0") > 0n && (
                      <p>취소 금액: {BigInt(store.cancelledWon).toLocaleString()}원</p>
                    )}
                    {BigInt(store.refundedWon || "0") > 0n && (
                      <p>환불 완료 금액: {BigInt(store.refundedWon).toLocaleString()}원</p>
                    )}
                    {store.refunds && store.refunds.length > 0 && (
                      <div className="store-refund-list">
                        <h4>환불 진행 내역</h4>
                        <ul>
                          {store.refunds.map((refund) => (
                            <li key={refund.id}>
                              환불 #{refund.id} · {BigInt(refund.amountWon).toLocaleString()}원 ·{" "}
                              <span className={`badge-tag badge-${refund.status.toLowerCase()}`}>
                                {formatRefundStatus(refund.status)}
                              </span>
                              {refund.lastError && (
                                <span className="refund-error-text">({refund.lastError})</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 취소 액션 버튼들 */}
                <div className="store-order-actions">
                  {store.canCancel && (
                    <button
                      type="button"
                      className="btn-danger-outline"
                      id={`btnCancelOrder-${store.id}`}
                      disabled={isCancelling}
                      onClick={() => startCancel(store, "GENERAL")}
                    >
                      주문 취소
                    </button>
                  )}
                  {store.canCancelRemaining && (
                    <button
                      type="button"
                      className="btn-danger-outline"
                      id={`btnCancelRemaining-${store.id}`}
                      disabled={isCancelling}
                      onClick={() => startCancel(store, "REMAINDER")}
                    >
                      남은 상품 전체 취소
                    </button>
                  )}
                </div>
              </section>
            ))}
          </article>
        ))}

        {/* 취소 확인 대화상자 */}
        {confirmingCancel && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-dialog-title"
          >
            <div className="modal-content hybrid-card cancel-confirm-modal">
              <header className="summary-card-header">
                <h3 id="cancel-dialog-title">
                  {confirmingCancel.kind === "GENERAL"
                    ? `${confirmingCancel.storeName} 주문 취소 확인`
                    : `${confirmingCancel.storeName} 남은 상품 전체 취소 확인`}
                </h3>
              </header>
              <div className="summary-card-body">
                <p>
                  {confirmingCancel.kind === "GENERAL"
                    ? "주문 마감 전입니다. 해당 매장 주문의 유효 상품 전체를 취소하시겠습니까? 결제 금액은 환불 처리됩니다."
                    : "일부 상품의 판매 실패로 인해 남은 상품 전체를 취소하시겠습니까? 남은 유효 상품 전체가 취소 및 환불 처리됩니다."}
                </p>
                <div className="checkout-actions">
                  <button
                    type="button"
                    className="btn-query-store btn-danger"
                    id="btnConfirmCancellation"
                    disabled={isCancelling}
                    onClick={() =>
                      void executeCancel(
                        confirmingCancel.storeOrderId,
                        confirmingCancel.requestKey,
                        confirmingCancel.kind,
                      )
                    }
                  >
                    {isCancelling ? "취소 처리 중..." : "취소 확정"}
                  </button>
                  <button
                    type="button"
                    className="text-action-link"
                    disabled={isCancelling}
                    onClick={() => setConfirmingCancel(null)}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 매장 제보 모달 */}
        {reportingStore && (
          <BuyerStoreReportModal
            storeId={reportingStore.id}
            storeName={reportingStore.name}
            onClose={() => setReportingStore(null)}
            onSessionExpired={onSessionExpired}
          />
        )}

        {/* 모의 결제 내역서 모달 */}
        {viewingStatementId !== null && (
          <OrderStatementModal
            key={viewingStatementId}
            checkoutId={viewingStatementId}
            onClose={() => setViewingStatementId(null)}
            onSessionExpired={onSessionExpired}
          />
        )}
      </div>
    </section>
  );
}
