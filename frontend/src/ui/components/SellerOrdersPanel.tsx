import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  formatRefundStatus,
  formatStoreOrderStatus,
  getSellerStoreOrder,
  getSellerStoreOrders,
  pickupStoreOrder,
  recordOrderFailure,
  type StoreOrderView,
} from "../../api/operations";
import { ApiError, type StoreView } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface Props {
  store: StoreView;
  onSessionExpired: () => void;
}

function dateToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function SellerOrdersPanel({ store, onSessionExpired }: Props): ReactElement {
  const [date, setDate] = useState<string>(dateToday);
  const [page, setPage] = useState<number>(0);
  const [orders, setOrders] = useState<StoreOrderView[]>([]);
  const [hasNext, setHasNext] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  // 주문 상세 및 수령/실패 처리 상태
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<StoreOrderView | null>(null);

  // 수령 코드 입력
  const [pickupCodeInput, setPickupCodeInput] = useState<string>("");

  // 판매 실패 입력
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [failureReason, setFailureReason] = useState<string>("");
  const [confirmingFailure, setConfirmingFailure] = useState<boolean>(false);

  const mounted = useRef(true);
  const request = useRef(0);
  const failureIntent = useRef<{ signature: string; key: string } | null>(null);

  const loadList = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);

    try {
      const data = await getSellerStoreOrders(store.id, { date, page });
      if (!mounted.current || current !== request.current) return;
      setOrders(data.items);
      setHasNext(data.hasNext);

      // 만약 상세가 열려있다면 상세 정보도 함께 최신화
      if (selectedOrderId !== null) {
        try {
          const orderDetail = await getSellerStoreOrder(store.id, selectedOrderId);
          if (mounted.current && current === request.current) {
            setSelectedOrder(orderDetail);
          }
        } catch (err: unknown) {
          if (!mounted.current || current !== request.current) return;
          setSelectedOrder(null);
          if (err instanceof ApiError && err.status === 401) onSessionExpired();
          else
            setError(
              err instanceof Error
                ? err.message
                : "주문 상세를 불러오지 못했습니다. 다시 조회해 주세요.",
            );
        }
      }
    } catch (err: unknown) {
      if (!mounted.current || current !== request.current) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "주문 목록을 불러오지 못했습니다. 다시 시도해 주세요.",
        );
      }
    } finally {
      if (mounted.current && current === request.current) {
        setLoading(false);
      }
    }
  }, [store.id, date, page, selectedOrderId, onSessionExpired]);

  useEffect(() => {
    mounted.current = true;
    void loadList();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [loadList, version]);

  function openDetail(order: StoreOrderView) {
    setSelectedOrderId(order.id);
    setSelectedOrder(null);
    setPickupCodeInput("");
    setSelectedItemIds([]);
    setFailureReason("");
    setNotice(null);
    setError(null);
    setConfirmingFailure(false);
    failureIntent.current = null;
    setVersion((v) => v + 1);
  }

  async function handlePickup() {
    if (!selectedOrder) return;
    const code = pickupCodeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("수령 코드는 6자리 숫자여야 합니다.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await pickupStoreOrder(store.id, selectedOrder.id, { code });
      if (!mounted.current) return;
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setPickupCodeInput("");
      setNotice("수령 완료 처리가 성공적으로 반영되었습니다.");
    } catch (err: unknown) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "수령 처리 중 오류가 발생했습니다. 코드와 수령 시간을 확인해 주세요.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function handleFailure() {
    if (!selectedOrder) return;
    if (selectedItemIds.length === 0) {
      setError("판매 실패로 처리할 상품을 1개 이상 선택해 주세요.");
      return;
    }
    const reason = failureReason.trim();
    if (!reason) {
      setError("판매 실패 사유를 입력해 주세요.");
      return;
    }
    if (reason.length > 500) {
      setError("판매 실패 사유는 500자 이하로 작성해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const signature = JSON.stringify([
        store.id,
        selectedOrder.id,
        [...selectedItemIds].sort((a, b) => a - b),
        reason,
      ]);
      if (failureIntent.current?.signature !== signature)
        failureIntent.current = { signature, key: crypto.randomUUID() };
      const updated = await recordOrderFailure(store.id, selectedOrder.id, {
        requestKey: failureIntent.current.key,
        itemIds: selectedItemIds,
        reason,
      });
      if (!mounted.current) return;
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      failureIntent.current = null;
      setSelectedItemIds([]);
      setFailureReason("");
      setConfirmingFailure(false);
      setNotice("선택한 상품의 판매 실패 처리가 완료되었습니다.");
    } catch (err: unknown) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "판매 실패 처리 중 오류가 발생했습니다. 주문 상태를 확인해 주세요.",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function toggleItemSelection(itemId: number) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }

  return (
    <section className="seller-orders-section" aria-labelledby="seller-orders-heading">
      <header className="summary-card-header">
        <h2 id="seller-orders-heading">주문 관리</h2>
        <p>당일 방문 수령 주문을 확인하고 상품 준비·수령 코드 확인 및 판매 실패를 관리합니다.</p>
      </header>

      <div className="summary-card-body">
        {notice && (
          <p className="notice-text" role="status" id="sellerOrderNotice">
            {notice}
          </p>
        )}
        <StatusAlert message={error} onRetry={() => setVersion((v) => v + 1)} />

        {/* 상세 화면이 선택되었을 때 */}
        {selectedOrder ? (
          <article className="seller-order-detail-card" aria-label="주문 상세 및 처리">
            <div className="detail-top-nav">
              <button
                type="button"
                className="text-action-link"
                id="btnBackToOrderList"
                disabled={busy || loading}
                onClick={() => {
                  setSelectedOrderId(null);
                  setSelectedOrder(null);
                  setError(null);
                  setNotice(null);
                }}
              >
                ← 주문 목록으로
              </button>
            </div>

            <div className="seller-order-header">
              <h3>
                매장 주문 #{selectedOrder.id}
                <span
                  className={`badge-tag badge-${selectedOrder.status.toLowerCase()}`}
                  id="sellerOrderDetailStatus"
                >
                  {formatStoreOrderStatus(selectedOrder.status)}
                </span>
              </h3>
            </div>

            <dl className="seller-order-meta">
              <div>
                <dt>수령일</dt>
                <dd>{selectedOrder.pickupDate}</dd>
              </div>
              <div>
                <dt>수령 시간대</dt>
                <dd>
                  {selectedOrder.startTime.slice(0, 5)} ~ {selectedOrder.endTime.slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt>주문 마감 시각</dt>
                <dd>{selectedOrder.orderDeadline.slice(0, 5)}</dd>
              </div>
            </dl>

            <section className="seller-order-items-mgmt">
              <h4>준비할 상품 목록</h4>
              <ul className="store-order-items">
                {selectedOrder.items.map((item) => (
                  <li
                    key={item.id}
                    className={`store-order-item ${item.cancelled ? "item-cancelled" : ""}`}
                  >
                    <div className="item-select-row">
                      {/* 수령 완료 또는 취소된 상품은 선택 불가 */}
                      {!item.cancelled &&
                        selectedOrder.status !== "PICKED_UP" &&
                        selectedOrder.status !== "CANCELLED" && (
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              disabled={busy || loading}
                            />
                            <span className="sr-only">{item.productName} 선택</span>
                          </label>
                        )}
                      <div className="item-main-info">
                        <strong>{item.productName}</strong> · {item.unitAmount}
                        {item.unitType === "WEIGHT" ? "g" : "개"} 포장 ×{" "}
                        <span className="valid-qty">{item.quantity}</span>포장 ·{" "}
                        {item.priceWon.toLocaleString()}원
                        {item.cancelled ? (
                          <span className="badge-cancelled">취소/판매실패</span>
                        ) : (
                          <span className="badge-valid">준비 대상</span>
                        )}
                      </div>
                    </div>
                    {item.cancelled && (
                      <p className="item-cancel-reason">
                        취소 사유: {item.cancellationReason || item.cancellationType || "판매 취소"}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* 환불/취소 내역 */}
            {(BigInt(selectedOrder.cancelledWon || "0") > 0n ||
              BigInt(selectedOrder.refundedWon || "0") > 0n ||
              selectedOrder.refunds.length > 0) && (
              <div className="store-refund-summary">
                {BigInt(selectedOrder.cancelledWon || "0") > 0n && (
                  <p>취소 금액: {BigInt(selectedOrder.cancelledWon).toLocaleString()}원</p>
                )}
                {BigInt(selectedOrder.refundedWon || "0") > 0n && (
                  <p>환불 완료 금액: {BigInt(selectedOrder.refundedWon).toLocaleString()}원</p>
                )}
                {selectedOrder.refunds.length > 0 && (
                  <div className="store-refund-list">
                    <h5>환불 내역</h5>
                    <ul>
                      {selectedOrder.refunds.map((ref) => (
                        <li key={ref.id}>
                          환불 #{ref.id} · {BigInt(ref.amountWon).toLocaleString()}원 ·{" "}
                          <span className={`badge-tag badge-${ref.status.toLowerCase()}`}>
                            {formatRefundStatus(ref.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 수령 처리 영역 */}
            {selectedOrder.status === "WAITING" && (
              <section className="seller-action-box pickup-box">
                <h4>수령 완료 처리</h4>
                <p className="field-help-text">
                  구매자가 제시한 숫자 6자리 수령 코드를 입력하면 유효 상품 전체가 수령 완료
                  처리됩니다.
                </p>
                <div className="pickup-form-inline">
                  <label htmlFor="sellerPickupCodeInput" className="field-label">
                    수령 코드 (6자리)
                  </label>
                  <input
                    id="sellerPickupCodeInput"
                    className="input-box"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="예: 246810"
                    value={pickupCodeInput}
                    disabled={busy || loading}
                    onChange={(e) => setPickupCodeInput(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    id="btnSubmitPickup"
                    className="btn-query-store"
                    disabled={busy || loading || pickupCodeInput.length !== 6}
                    onClick={() => void handlePickup()}
                  >
                    {busy ? "처리 중..." : "수령 확인"}
                  </button>
                </div>
              </section>
            )}

            {/* 판매 실패 처리 영역 */}
            {selectedOrder.status !== "PICKED_UP" &&
              selectedOrder.status !== "CANCELLED" &&
              selectedOrder.items.some((i) => !i.cancelled) && (
                <section className="seller-action-box failure-box">
                  <h4>선택 상품 판매 실패 처리</h4>
                  <p className="field-help-text">
                    재고 부족이나 파손 등으로 제공 불가한 상품을 체크하고 사유를 등록하면 해당
                    상품만 취소 및 환불됩니다.
                  </p>
                  <div className="field-group">
                    <label htmlFor="sellerFailureReasonInput" className="field-label">
                      판매 실패 사유 (1~500자)
                    </label>
                    <textarea
                      id="sellerFailureReasonInput"
                      className="input-box"
                      rows={3}
                      maxLength={500}
                      placeholder="예: 오늘 현장 재고 파손으로 제공 불가"
                      value={failureReason}
                      disabled={busy || loading}
                      onChange={(e) => setFailureReason(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    id="btnStartFailure"
                    className="btn-danger-outline"
                    disabled={
                      busy || loading || selectedItemIds.length === 0 || !failureReason.trim()
                    }
                    onClick={() => setConfirmingFailure(true)}
                  >
                    선택 상품 판매 실패 처리 ({selectedItemIds.length}개 선택됨)
                  </button>
                </section>
              )}

            {/* 판매 실패 확인 모달 */}
            {confirmingFailure && (
              <div
                className="modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="failure-dialog-title"
              >
                <div className="modal-content hybrid-card cancel-confirm-modal">
                  <header className="summary-card-header">
                    <h3 id="failure-dialog-title">판매 실패 처리 확인</h3>
                  </header>
                  <div className="summary-card-body">
                    <p>
                      선택하신 상품 {selectedItemIds.length}건을 제공 불가로 판매 실패
                      처리하시겠습니까? 선택 상품은 즉시 취소되고 구매자에게 환불됩니다.
                    </p>
                    <div className="checkout-actions">
                      <button
                        type="button"
                        className="btn-query-store btn-danger"
                        id="btnConfirmFailure"
                        disabled={busy || loading}
                        onClick={() => void handleFailure()}
                      >
                        {busy ? "처리 중..." : "판매 실패 확정"}
                      </button>
                      <button
                        type="button"
                        className="text-action-link"
                        disabled={busy || loading}
                        onClick={() => setConfirmingFailure(false)}
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
        ) : (
          /* 주문 목록 화면 */
          <div className="seller-orders-list-view">
            <div className="seller-orders-filters">
              <label className="field-label" htmlFor="sellerOrderDate">
                수령일 선택
              </label>
              <input
                type="date"
                id="sellerOrderDate"
                className="input-box"
                value={date}
                disabled={loading}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(0);
                }}
              />
              <button
                type="button"
                className="text-action-link"
                disabled={loading}
                onClick={() => setVersion((v) => v + 1)}
                id="btnRefreshSellerOrders"
              >
                새로고침
              </button>
            </div>

            {loading && <p role="status">주문 목록을 불러오고 있습니다...</p>}

            {!loading && !error && orders.length === 0 && (
              <div className="market-empty">
                <h3>선택한 날짜에 접수된 주문이 없습니다.</h3>
                <p>다른 날짜를 선택하거나 새로운 주문을 기다려 주세요.</p>
              </div>
            )}

            {!loading && orders.length > 0 && (
              <div className="seller-orders-table-wrap">
                <table className="info-data-table seller-orders-table">
                  <thead>
                    <tr>
                      <th scope="col">주문 번호</th>
                      <th scope="col">상태</th>
                      <th scope="col">수령 시간</th>
                      <th scope="col">주문 마감</th>
                      <th scope="col">준비 상품 및 유효 수량</th>
                      <th scope="col">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} id={`sellerOrderRow-${order.id}`}>
                        <td>#{order.id}</td>
                        <td>
                          <span className={`badge-tag badge-${order.status.toLowerCase()}`}>
                            {formatStoreOrderStatus(order.status)}
                          </span>
                        </td>
                        <td>
                          {order.startTime.slice(0, 5)} ~ {order.endTime.slice(0, 5)}
                        </td>
                        <td>{order.orderDeadline.slice(0, 5)}</td>
                        <td>
                          <ul className="table-item-list">
                            {order.items.map((item) => (
                              <li
                                key={item.id}
                                className={item.cancelled ? "item-cancelled-text" : ""}
                              >
                                {item.productName} × {item.quantity}
                                {item.cancelled && " (취소됨)"}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary-sm"
                            id={`btnViewSellerOrder-${order.id}`}
                            onClick={() => void openDetail(order)}
                          >
                            상세 / 처리
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 페이징 네비게이션 */}
            <nav className="admin-pages" aria-label="주문 목록 페이지">
              <button
                type="button"
                id="btnPrevOrderPage"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                이전
              </button>
              <span>{page + 1}페이지</span>
              <button
                type="button"
                id="btnNextOrderPage"
                disabled={!hasNext || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </nav>
          </div>
        )}
      </div>
    </section>
  );
}
