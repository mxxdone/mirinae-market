import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { getOrderStatement, type Statement } from "../../api/checkout";
import { formatRefundStatus, formatStoreOrderStatus } from "../../api/operations";
import { ApiError } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface OrderStatementModalProps {
  checkoutId: number;
  onClose: () => void;
  onSessionExpired: () => void;
}

export function formatSeoulTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  const normalized = String(value)
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function OrderStatementModal({
  checkoutId,
  onClose,
  onSessionExpired,
}: OrderStatementModalProps): ReactElement {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadStatement = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentReq = ++requestIdRef.current;
    setLoading(true);
    setStatement(null);
    setError(null);

    try {
      const data = await getOrderStatement(checkoutId, controller.signal);
      if (currentReq !== requestIdRef.current) return;
      setStatement(data);
    } catch (err: unknown) {
      if (currentReq !== requestIdRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      // 실패 시 오래된 내역서를 인쇄할 수 없도록 초기화
      setStatement(null);

      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "모의 결제 내역서를 불러오지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      if (currentReq === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [checkoutId, onSessionExpired]);

  useEffect(() => {
    void loadStatement();

    return () => {
      abortControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [loadStatement]);

  // 네이티브 모달은 배경 접근과 초점 이탈을 막고, 닫힌 뒤 원래 버튼으로 돌아간다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons?.[0];
    const last = buttons?.[buttons.length - 1];
    // 마지막 버튼에서 브라우저 도구 모음으로 초점이 넘어가지 않게 순환한다.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function handlePrint() {
    if (!statement || loading) return;
    window.print();
  }

  const totalCancelledWon =
    statement?.storeOrders.reduce((sum, s) => sum + BigInt(s.cancelledWon || "0"), 0n) ?? 0n;
  const totalRefundedWon =
    statement?.storeOrders.reduce((sum, s) => sum + BigInt(s.refundedWon || "0"), 0n) ?? 0n;
  const originalTotalWon = statement ? BigInt(statement.totalWon) : 0n;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-backdrop statement-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statement-dialog-title"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-content hybrid-card order-statement-modal" role="document">
        <header className="summary-card-header statement-header">
          <div className="statement-actions no-print">
            <button
              type="button"
              id="btnRefreshStatement"
              className="text-action-link"
              onClick={() => void loadStatement()}
              disabled={loading}
            >
              새로 조회
            </button>
            <button
              type="button"
              id="btnPrintStatement"
              className="btn-query-store"
              onClick={handlePrint}
              disabled={!statement || loading}
            >
              인쇄
            </button>
            <button
              type="button"
              id="btnCloseStatement"
              ref={closeButtonRef}
              className="text-action-link"
              onClick={onClose}
            >
              닫기
            </button>
          </div>
          <h2 id="statement-dialog-title">모의 결제 내역서</h2>
          <p className="statement-subtitle">주문 확정 당시 저장된 조건 및 현재 취소·환불 상태</p>
        </header>

        <div className="summary-card-body statement-body">
          {loading && <p role="status">모의 결제 내역서를 최신 상태로 불러오고 있습니다...</p>}

          <StatusAlert message={error} onRetry={() => void loadStatement()} />

          {statement && (
            <div className="statement-sheet printable-content">
              <div
                className="statement-test-notice alert-warning"
                role="note"
                id="statementTestNotice"
              >
                <p>
                  <strong>[테스트 모의 결제 안내]</strong>
                </p>
                <p>{statement.testNotice}</p>
              </div>

              <section className="statement-section" aria-label="주문 기본 정보">
                <table className="statement-meta-table">
                  <tbody>
                    <tr>
                      <th scope="row">주문 번호</th>
                      <td id="statementOrderId">#{statement.id}</td>
                      <th scope="row">결제 시각 (한국 시간)</th>
                      <td id="statementConfirmedAt">
                        {formatSeoulTimestamp(statement.confirmedAt)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">원결제 총액</th>
                      <td id="statementTotalWon" className="statement-amount-highlight">
                        {originalTotalWon.toLocaleString()}원
                      </td>
                      <th scope="row">취소 / 환불 합계</th>
                      <td id="statementRefundSummary">
                        {totalCancelledWon > 0n && (
                          <span className="statement-cancelled-amount">
                            취소 {totalCancelledWon.toLocaleString()}원
                          </span>
                        )}
                        {totalRefundedWon > 0n && (
                          <span className="statement-refunded-amount">
                            {" "}
                            (환불 완료 {totalRefundedWon.toLocaleString()}원)
                          </span>
                        )}
                        {totalCancelledWon === 0n && totalRefundedWon === 0n && (
                          <span>취소/환불 없음</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <div className="statement-stores-container">
                {statement.storeOrders.map((store) => (
                  <article
                    key={store.id}
                    className="statement-store-card"
                    data-statement-store-id={store.id}
                  >
                    <div className="statement-store-header">
                      <h3>
                        {store.storeName} · 매장 주문 #{store.id}
                      </h3>
                      <span className={`badge-tag badge-${store.status.toLowerCase()}`}>
                        {formatStoreOrderStatus(store.status)}
                      </span>
                    </div>

                    {/* 수령 코드: 화면에는 표시되나, 인쇄 시에는 pickup-code-box 클래스로 제외됨 */}
                    {store.pickupCode && (
                      <p className="pickup-code-box" id={`statementPickupCode-${store.id}`}>
                        수령 코드: <strong>{store.pickupCode}</strong>
                      </p>
                    )}

                    <p className="statement-pickup-window">
                      수령 예정일: {store.pickupDate} ({store.startTime.slice(0, 5)} ~{" "}
                      {store.endTime.slice(0, 5)})
                    </p>

                    <table className="statement-items-table">
                      <thead>
                        <tr>
                          <th scope="col">상품명</th>
                          <th scope="col">포장 규격</th>
                          <th scope="col">수량</th>
                          <th scope="col">단가</th>
                          <th scope="col">소계</th>
                          <th scope="col">상태</th>
                        </tr>
                      </thead>
                      <tbody>
                        {store.items.map((item) => {
                          const itemSubtotal = BigInt(item.priceWon) * BigInt(item.quantity);
                          return (
                            <tr
                              key={item.id}
                              className={item.cancelled ? "statement-item-cancelled" : ""}
                            >
                              <td className="item-name-cell">
                                <strong>{item.productName}</strong>
                              </td>
                              <td>
                                {item.unitAmount}
                                {item.unitType === "WEIGHT" ? "g" : "개"}
                              </td>
                              <td className="item-qty-cell">{item.quantity}</td>
                              <td className="item-price-cell">
                                {item.priceWon.toLocaleString()}원
                              </td>
                              <td className="item-subtotal-cell">
                                {itemSubtotal.toLocaleString()}원
                              </td>
                              <td>
                                {item.cancelled ? (
                                  <span className="badge-cancelled">
                                    취소됨
                                    {item.cancellationReason && ` (${item.cancellationReason})`}
                                  </span>
                                ) : (
                                  <span className="badge-normal">정상</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {(BigInt(store.cancelledWon || "0") > 0n ||
                      BigInt(store.refundedWon || "0") > 0n ||
                      store.refunds.length > 0) && (
                      <div className="statement-store-refund-info">
                        <div className="statement-refund-amounts">
                          {BigInt(store.cancelledWon || "0") > 0n && (
                            <p>
                              매장 취소 금액:{" "}
                              <strong>{BigInt(store.cancelledWon).toLocaleString()}원</strong>
                            </p>
                          )}
                          {BigInt(store.refundedWon || "0") > 0n && (
                            <p>
                              매장 환불 완료 금액:{" "}
                              <strong>{BigInt(store.refundedWon).toLocaleString()}원</strong>
                            </p>
                          )}
                        </div>

                        {store.refunds.length > 0 && (
                          <ul className="statement-refund-list">
                            {store.refunds.map((refund) => (
                              <li key={refund.id}>
                                환불 #{refund.id} · {BigInt(refund.amountWon).toLocaleString()}원 ·{" "}
                                <span className={`badge-tag badge-${refund.status.toLowerCase()}`}>
                                  {formatRefundStatus(refund.status)}
                                </span>
                                {refund.completedAt && (
                                  <span className="refund-time">
                                    {" "}
                                    (완료: {formatSeoulTimestamp(refund.completedAt)})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
