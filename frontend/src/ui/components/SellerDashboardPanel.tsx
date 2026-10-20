import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  formatUnit,
  formatWon,
  getSellerDashboard,
  type SellerDashboardView,
} from "../../api/dashboard";
import { ApiError, type StoreView } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface Props {
  store: StoreView;
  onSessionExpired: () => void;
}

/** 한국 시간 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function getTodayDateSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 한국 시간 기준 이번 달 문자열 (YYYY-MM) */
export function getCurrentMonthSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/** UTC 시각을 한국 시간 문자열로 포맷팅 */
export function formatAsOfSeoul(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return isoUtc;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return isoUtc;
  }
}

/**
 * 판매자 전용 대시보드 패널
 * 수령일별 주문 준비·상태와 전체 기간 유효 실적, 선택 월 모의 결제 금액을 원본 데이터에서 조회합니다.
 */
export function SellerDashboardPanel({ store, onSessionExpired }: Props): ReactElement {
  const [date, setDate] = useState<string>(getTodayDateSeoul);
  const [month, setMonth] = useState<string>(getCurrentMonthSeoul);
  const [data, setData] = useState<SellerDashboardView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  const activeRequestRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // 이전 진행 중인 요청 취소 및 식별자 갱신
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentReqId = ++activeRequestRef.current;

    setLoading(true);
    setError(null);
    // 기간 변경 또는 재조회 시 이전 지표를 새 기간 결과로 오인하지 않도록 초기화
    setData(null);

    async function fetchDashboard() {
      try {
        const result = await getSellerDashboard(store.id, { date, month }, controller.signal);
        if (
          controller.signal.aborted ||
          activeRequestRef.current === 0 ||
          currentReqId !== activeRequestRef.current
        ) {
          return;
        }
        setData(result);
      } catch (err: unknown) {
        if (
          controller.signal.aborted ||
          activeRequestRef.current === 0 ||
          currentReqId !== activeRequestRef.current
        ) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
          return;
        }
        setData(null);
        setError(
          err instanceof Error
            ? err.message
            : "대시보드 지표를 불러오지 못했습니다. 다시 시도해 주세요.",
        );
      } finally {
        if (
          !controller.signal.aborted &&
          activeRequestRef.current !== 0 &&
          currentReqId === activeRequestRef.current
        ) {
          setLoading(false);
        }
      }
    }

    void fetchDashboard();

    return () => {
      // 언마운트 시 요청 식별자를 무효화하고 진행 중인 요청을 취소하여 늦은 응답/401이 세션·화면을 변경하지 못하도록 방어
      activeRequestRef.current = 0;
      controller.abort();
    };
  }, [store.id, date, month, version, onSessionExpired]);

  return (
    <section className="seller-dashboard-section" aria-labelledby="seller-dashboard-heading">
      <header className="summary-card-header seller-dashboard-header">
        <div className="seller-dashboard-title-group">
          <h2 id="seller-dashboard-heading">판매자 대시보드</h2>
          <p>
            수령일별 주문 준비·이행 현황과 누적 실적, 월별 모의 결제 금액을 원본 데이터에서 정확하게
            조회합니다.
          </p>
        </div>
      </header>

      <div className="dashboard-controls" aria-label="대시보드 조회 조건">
        <div className="dashboard-control-group">
          <label htmlFor="sellerDashboardDate">수령일 선택</label>
          <input
            type="date"
            id="sellerDashboardDate"
            className="input-box"
            min="0001-01-01"
            max="9999-12-31"
            value={date}
            disabled={false}
            onChange={(e) => {
              const next = e.target.value;
              if (next) setDate(next);
            }}
          />
        </div>
        <div className="dashboard-control-group">
          <label htmlFor="sellerDashboardMonth">조회 월 선택</label>
          <input
            type="month"
            id="sellerDashboardMonth"
            className="input-box"
            min="0001-01"
            max="9999-12"
            value={month}
            disabled={false}
            onChange={(e) => {
              const next = e.target.value;
              if (next) setMonth(next);
            }}
          />
        </div>
        <button
          type="button"
          id="btnRefreshDashboard"
          className="btn-query-store"
          disabled={loading}
          onClick={() => setVersion((v) => v + 1)}
        >
          {loading ? "조회 중..." : "새로고침"}
        </button>
      </div>

      {loading && <p role="status">대시보드 지표를 불러오고 있습니다...</p>}

      <StatusAlert
        id="sellerDashboardAlert"
        message={error}
        onRetry={() => setVersion((v) => v + 1)}
      />

      {data && (
        <>
          <div className="dashboard-meta-row">
            <span className="dashboard-asof">
              기준 시각: <strong>{formatAsOfSeoul(data.asOf)}</strong> (한국 시간)
            </span>
            <span className="dashboard-mock-badge">모의 결제 (정산·매출 아님)</span>
          </div>

          {/* 수령일별 이행 현황 및 상품 준비 */}
          <section className="dashboard-card-group" aria-labelledby="daily-status-heading">
            <div className="dashboard-group-header">
              <h3 id="daily-status-heading">수령일별 주문 상태 ({data.date})</h3>
              <span className="group-help-text">선택한 수령일 기준 주문 상태입니다.</span>
            </div>

            <div className="dashboard-metric-grid">
              <div className="dashboard-metric-card" id="cardDailyTotal">
                <span className="dashboard-metric-label">전체 주문</span>
                <span className="dashboard-metric-value" id="valDailyTotal">
                  {data.daily.totalOrders.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">대기·완료·미수령·전체 취소 합계</span>
              </div>
              <div className="dashboard-metric-card card-highlight" id="cardDailyWaiting">
                <span className="dashboard-metric-label">
                  <span className="badge-tag badge-waiting">수령 대기</span>
                </span>
                <span className="dashboard-metric-value" id="valDailyWaiting">
                  {data.daily.waitingOrders.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">방문 예정인 대기 주문</span>
              </div>
              <div className="dashboard-metric-card" id="cardDailyPickedUp">
                <span className="dashboard-metric-label">
                  <span className="badge-tag badge-picked_up">수령 완료</span>
                </span>
                <span className="dashboard-metric-value" id="valDailyPickedUp">
                  {data.daily.pickedUpOrders.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">현장 방문 수령 완료</span>
              </div>
              <div className="dashboard-metric-card" id="cardDailyNoShow">
                <span className="dashboard-metric-label">
                  <span className="badge-tag badge-no_show">미수령</span>
                </span>
                <span className="dashboard-metric-value" id="valDailyNoShow">
                  {data.daily.noShowOrders.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">수령 마감 시간까지 미방문</span>
              </div>
              <div className="dashboard-metric-card card-subtle" id="cardDailyCancelled">
                <span className="dashboard-metric-label">
                  <span className="badge-tag badge-cancelled">전체 취소</span>
                </span>
                <span className="dashboard-metric-value" id="valDailyCancelled">
                  {data.daily.cancelledOrders.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">모든 상품이 취소된 주문</span>
              </div>
            </div>

            <div className="dashboard-highlight-box" id="boxPartialCancellation">
              <div>
                <strong>부분 취소 주문: </strong>
                <span id="metricPartiallyCancelledOrders">
                  {data.daily.partiallyCancelledOrders.toLocaleString()}건
                </span>
              </div>
              <span className="group-help-text">
                일부 상품만 취소된 주문 건수이며 상태별 합계에는 중복 가산되지 않습니다.
              </span>
            </div>
          </section>

          {/* 상품별 준비 수량 */}
          <section className="dashboard-card-group" aria-labelledby="preparation-items-heading">
            <div className="dashboard-group-header">
              <h3 id="preparation-items-heading">상품별 준비 수량 ({data.date})</h3>
              <span className="group-help-text">
                수령 대기 주문에서 아직 취소되지 않은 상품의 수량 합계입니다.
              </span>
            </div>

            {data.preparationItems.length === 0 ? (
              <div className="dashboard-table-empty" id="preparationEmpty">
                선택한 수령일에 준비가 필요한 수령 대기 상품이 없습니다.
              </div>
            ) : (
              <div className="admin-table-wrap">
                <table className="info-data-table" id="tablePreparationItems">
                  <thead>
                    <tr>
                      <th scope="col">상품 번호</th>
                      <th scope="col">상품명</th>
                      <th scope="col">포장/판매 구성</th>
                      <th scope="col">준비 필요 수량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.preparationItems.map((item) => (
                      <tr
                        key={`${item.productId}-${item.productName}-${item.unitType}-${item.unitAmount}`}
                      >
                        <td>{item.productId}</td>
                        <td>
                          <strong>{item.productName}</strong>
                        </td>
                        <td>{formatUnit(item.unitType, item.unitAmount)}</td>
                        <td>
                          <strong className="valid-qty">{item.quantity.toLocaleString()}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 모의 결제 금액 및 누적 실적 */}
          <section className="dashboard-card-group" aria-labelledby="monthly-metrics-heading">
            <div className="dashboard-group-header">
              <h3 id="monthly-metrics-heading">선택 월 모의 결제 ({data.month})</h3>
              <span className="group-help-text">
                결제 확정 월 기준이며, 다음 달 환불도 원결제 월에 반영되어 완료된 환불액만
                차감됩니다.
              </span>
            </div>

            <div className="dashboard-metric-grid">
              <div className="dashboard-metric-card" id="cardMonthlyPayment">
                <span className="dashboard-metric-label">결제 총액</span>
                <span className="dashboard-metric-value" id="valMonthlyPayment">
                  {formatWon(data.monthly.paymentWon)}
                </span>
                <span className="dashboard-metric-desc">전체 취소 포함 원결제 금액</span>
              </div>
              <div className="dashboard-metric-card" id="cardMonthlyRefund">
                <span className="dashboard-metric-label">완료된 환불액</span>
                <span className="dashboard-metric-value" id="valMonthlyRefund">
                  {formatWon(data.monthly.refundWon)}
                </span>
                <span className="dashboard-metric-desc">완료된 환불 금액</span>
              </div>
              <div className="dashboard-metric-card card-highlight" id="cardMonthlyNet">
                <span className="dashboard-metric-label">환불 차감 후 금액</span>
                <span className="dashboard-metric-value" id="valMonthlyNet">
                  {formatWon(data.monthly.netWon)}
                </span>
                <span className="dashboard-metric-desc">결제 총액 − 완료 환불액</span>
              </div>
            </div>
          </section>

          <section className="dashboard-card-group" aria-labelledby="lifetime-metrics-heading">
            <div className="dashboard-group-header">
              <h3 id="lifetime-metrics-heading">누적 주문 실적 (전체 기간)</h3>
              <span className="group-help-text">
                전체 취소된 주문을 제외한 유효 주문과 실제 구매자 수 기준입니다.
              </span>
            </div>

            <div className="dashboard-metric-grid">
              <div className="dashboard-metric-card" id="cardLifetimeOrders">
                <span className="dashboard-metric-label">누적 주문 수</span>
                <span className="dashboard-metric-value" id="valLifetimeOrders">
                  {data.lifetime.orderCount.toLocaleString()}건
                </span>
                <span className="dashboard-metric-desc">전체 취소 제외 유효 주문</span>
              </div>
              <div className="dashboard-metric-card" id="cardLifetimeBuyers">
                <span className="dashboard-metric-label">중복 제외 구매자 수</span>
                <span className="dashboard-metric-value" id="valLifetimeBuyers">
                  {data.lifetime.buyerCount.toLocaleString()}명
                </span>
                <span className="dashboard-metric-desc">동일 구매자 1명 집계</span>
              </div>
              <div className="dashboard-metric-card" id="cardLifetimePayment">
                <span className="dashboard-metric-label">누적 결제 총액</span>
                <span className="dashboard-metric-value" id="valLifetimePayment">
                  {formatWon(data.lifetime.paymentWon)}
                </span>
                <span className="dashboard-metric-desc">전체 취소 포함 원결제 금액</span>
              </div>
              <div className="dashboard-metric-card" id="cardLifetimeRefund">
                <span className="dashboard-metric-label">누적 완료 환불액</span>
                <span className="dashboard-metric-value" id="valLifetimeRefund">
                  {formatWon(data.lifetime.refundWon)}
                </span>
                <span className="dashboard-metric-desc">완료된 환불 금액</span>
              </div>
              <div className="dashboard-metric-card card-highlight" id="cardLifetimeNet">
                <span className="dashboard-metric-label">누적 차감 후 금액</span>
                <span className="dashboard-metric-value" id="valLifetimeNet">
                  {formatWon(data.lifetime.netWon)}
                </span>
                <span className="dashboard-metric-desc">누적 결제 − 누적 완료 환불</span>
              </div>
            </div>
          </section>

          <div className="dashboard-disclaimer" role="note">
            <p>
              • 본 대시보드의 모든 금액 지표는 <strong>모의 결제</strong> 기준이며, 실제 정산이나
              매출 인식이 아닙니다.
            </p>
            <p>
              • 누적 주문 수와 구매자 수는 전체 취소된 주문을 제외한 유효 주문만을 집계하며, 누적 및
              월별 금액은 전체 취소 주문의 원결제 금액을 포함한 뒤 완료된 환불액을 차감합니다.
            </p>
            <p>
              • 월별 금액은 원결제 확정 월에 귀속되므로, 다음 달에 환불이 완료되면 이전 월의
              환불액과 차감 후 금액이 변동될 수 있습니다.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
