import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { applySales, getSaleProducts, getPickupWindow } from "../../api/products";
import {
  ApiError,
  type PickupWindowInput,
  type ProductView,
  type SaleProductView,
  type SaleIssue,
  type StoreView,
} from "../../api/types";
import { todayPickupDate } from "../../validation/productValidation";
import { parseSaleDrafts, type SaleDraft } from "../../validation/salesValidation";
import { Pagination } from "./Pagination";
import { ProductEditor } from "./ProductEditor";
import { StatusAlert } from "./StatusAlert";

function draftOf(row: SaleProductView): SaleDraft {
  return {
    productId: row.product.id,
    selling: row.selling,
    price: row.priceWon === null ? "" : String(row.priceWon),
    quantity: row.onlineQuantity === null ? "" : String(row.onlineQuantity),
  };
}
function sameDraft(a: SaleDraft, b: SaleDraft) {
  return a.selling === b.selling && a.price === b.price && a.quantity === b.quantity;
}
function windowKey(value: PickupWindowInput) {
  return `${value.orderDeadline}|${value.startTime}|${value.endTime}`;
}
const INITIAL_WINDOW: PickupWindowInput = {
  orderDeadline: "14:00",
  startTime: "15:00",
  endTime: "19:00",
};
function koreanTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function SellerProductsPanel({
  store,
  onSessionExpired,
  editorId,
  onProductPage,
}: {
  store: StoreView;
  onSessionExpired: () => void;
  editorId: number | "new" | null;
  onProductPage: (id: number | "new" | null) => void;
}) {
  const [rows, setRows] = useState<SaleProductView[]>([]);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, SaleDraft>>({});
  const [snapshots, setSnapshots] = useState<Record<number, SaleProductView>>({});
  const [windowInput, setWindowInput] = useState<PickupWindowInput>(INITIAL_WINDOW);
  const [savedWindow, setSavedWindow] = useState<string | null>(null);
  const [windowReady, setWindowReady] = useState(false);
  const [windowLoading, setWindowLoading] = useState(true);
  const [date, setDate] = useState(todayPickupDate);
  const [expired, setExpired] = useState(false);
  const [currentTime, setCurrentTime] = useState(koreanTime);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<SaleIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const mounted = useRef(true);
  const listRequest = useRef(0);
  const windowRequest = useRef(0);
  const changes = Object.values(drafts);
  const timeChanged = windowReady && savedWindow !== windowKey(windowInput);
  const closed =
    windowReady && savedWindow !== null && currentTime >= (savedWindow.split("|")[0] ?? "24:00");
  const handleError = useCallback(
    (failure: unknown) => {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else {
        setError(failure instanceof Error ? failure.message : "판매 정보를 불러오지 못했습니다.");
        if (failure instanceof ApiError) setIssues(failure.issues);
      }
    },
    [onSessionExpired],
  );
  const loadList = useCallback(
    async (nextPage: number) => {
      const version = ++listRequest.current;
      setLoading(true);
      try {
        let result = await getSaleProducts(store.id, date, nextPage);
        const actualPage = Math.min(nextPage, Math.max(0, Math.ceil(result.totalItems / 20) - 1));
        if (actualPage !== nextPage) result = await getSaleProducts(store.id, date, actualPage);
        if (!mounted.current || version !== listRequest.current) return;
        setRows(result.items);
        setPage(actualPage);
        setTotalItems(result.totalItems);
        setSnapshots((previous) => ({
          ...previous,
          ...Object.fromEntries(result.items.map((row) => [row.product.id, row])),
        }));
      } catch (failure) {
        if (version === listRequest.current) handleError(failure);
      } finally {
        if (mounted.current && version === listRequest.current) setLoading(false);
      }
    },
    [store.id, date, handleError],
  );
  const loadWindow = useCallback(async () => {
    const version = ++windowRequest.current;
    setWindowLoading(true);
    setWindowReady(false);
    try {
      const value = await getPickupWindow(store.id, date);
      if (!mounted.current || version !== windowRequest.current) return;
      const input = value
        ? {
            orderDeadline: value.orderDeadline.slice(0, 5),
            startTime: value.startTime.slice(0, 5),
            endTime: value.endTime.slice(0, 5),
          }
        : INITIAL_WINDOW;
      setWindowInput(input);
      setSavedWindow(value ? windowKey(input) : null);
      setWindowReady(true);
    } catch (failure) {
      if (version === windowRequest.current) handleError(failure);
    } finally {
      if (mounted.current && version === windowRequest.current) setWindowLoading(false);
    }
  }, [store.id, date, handleError]);
  useEffect(() => {
    mounted.current = true;
    void loadList(0);
    void loadWindow();
    return () => {
      mounted.current = false;
      ++listRequest.current;
      ++windowRequest.current;
    };
  }, [loadList, loadWindow]);
  useEffect(() => {
    const timer = setInterval(() => {
      setExpired(date !== todayPickupDate());
      setCurrentTime(koreanTime());
    }, 30000);
    return () => clearInterval(timer);
  }, [date]);
  function patch(row: SaleProductView, value: Partial<SaleDraft>) {
    setSuccess(null);
    setIssues((previous) => previous.filter((issue) => issue.productId !== row.product.id));
    setDrafts((previous) => {
      const updated = { ...(previous[row.product.id] ?? draftOf(row)), ...value };
      const next = { ...previous };
      if (sameDraft(updated, draftOf(row))) delete next[row.product.id];
      else next[row.product.id] = updated;
      return next;
    });
  }
  function openProduct(id: number | "new") {
    setSuccess(null);
    setError(null);
    onProductPage(id);
  }
  function excludeChange(id: number) {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setIssues((previous) => previous.filter((issue) => issue.productId !== id));
    void loadList(page);
  }
  async function refreshAll() {
    setConfirmRefresh(false);
    setDrafts({});
    setSnapshots({});
    setIssues([]);
    setError(null);
    setSuccess(null);
    setExpired(false);
    const nextDate = todayPickupDate();
    if (nextDate !== date) {
      setRows([]);
      setDate(nextDate);
    } else await Promise.all([loadList(page), loadWindow()]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIssues([]);
    if (date !== todayPickupDate()) {
      setExpired(true);
      setError("수령 날짜가 바뀌었습니다. 작성한 내용을 확인하고 새 날짜로 새로고침해 주세요.");
      return;
    }
    const parsed = parseSaleDrafts(changes);
    if (closed) {
      setError("주문 마감 시각이 지났습니다. 오늘 판매 조건은 변경할 수 없습니다.");
      return;
    }
    if (parsed.issues.length) {
      setIssues(parsed.issues);
      setError(
        parsed.issues.find((issue) => issue.productId === null)?.message ??
          "오류 행을 확인해 주세요. 모든 변경을 적용하지 않았습니다.",
      );
      return;
    }
    if (!windowReady) {
      setError("공통 시간을 먼저 조회해 주세요.");
      return;
    }
    if (
      !windowInput.startTime ||
      !windowInput.endTime ||
      windowInput.startTime >= windowInput.endTime ||
      !windowInput.orderDeadline ||
      windowInput.orderDeadline > windowInput.startTime
    ) {
      setError("주문 마감 ≤ 수령 시작 < 수령 마감 순서로 시간을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await applySales(store.id, date, { ...windowInput, products: parsed.products });
      if (!mounted.current) return;
      const apply = (row: SaleProductView): SaleProductView => {
        const change = parsed.products.find((item) => item.productId === row.product.id);
        return change
          ? {
              ...row,
              selling: change.selling,
              priceWon: change.selling ? change.priceWon : row.priceWon,
              onlineQuantity: change.selling ? change.onlineQuantity : row.onlineQuantity,
              product: { ...row.product, hasSales: row.product.hasSales || change.selling },
            }
          : row;
      };
      setRows((previous) => previous.map(apply));
      setSnapshots((previous) =>
        Object.fromEntries(Object.entries(previous).map(([id, row]) => [id, apply(row)])),
      );
      setDrafts({});
      setSavedWindow(windowKey(windowInput));
      setSuccess("변경 사항이 모두 적용되었습니다. 판매 체크한 상품이 공개됩니다.");
      await loadList(page);
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function productSaved(product: ProductView) {
    if (!mounted.current) return;
    onProductPage(null);
    setSuccess("상품 정보가 저장되었습니다. 판매할 상품을 체크하고 가격·수량을 적용해 주세요.");
    await loadList(editorId === "new" ? Math.floor(totalItems / 20) : page);
    setSnapshots((previous) => {
      const row = previous[product.id];
      return {
        ...previous,
        [product.id]: row
          ? { ...row, product }
          : { product, selling: false, priceWon: null, onlineQuantity: null },
      };
    });
  }
  async function productDeleted(id: number) {
    if (!mounted.current) return;
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setIssues((previous) => previous.filter((issue) => issue.productId !== id));
    onProductPage(null);
    setSuccess("상품이 삭제되었습니다. 상품·판매 기록은 보존됩니다.");
    await loadList(Math.min(page, Math.max(0, Math.ceil((totalItems - 1) / 20) - 1)));
  }
  return (
    <section className="seller-sales" aria-labelledby="heading-products">
      <h2 id="heading-products" className="sr-only">
        판매 상품 목록
      </h2>
      <StatusAlert
        message={error}
        onRetry={() => {
          setError(null);
          void loadList(page);
          if (!windowReady) void loadWindow();
        }}
      />
      {success && (
        <p role="status" className="market-success">
          {success}
        </p>
      )}
      {editorId !== null ? (
        <ProductEditor
          key={editorId}
          storeId={store.id}
          productId={editorId === "new" ? null : editorId}
          onSaved={productSaved}
          onDeleted={productDeleted}
          onBack={() => onProductPage(null)}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <div className="sales-toolbar">
            <span>{date} 수령 · 한국 시간 기준</span>
            <div className="product-actions">
              <button
                type="button"
                className="btn-query-store"
                onClick={() => openProduct("new")}
                disabled={busy}
              >
                상품 추가
              </button>
              <button
                type="button"
                className="pagination-button"
                aria-label="상품 목록 새로고침"
                title="새로고침"
                disabled={busy || loading}
                onClick={() => {
                  if (changes.length || timeChanged) setConfirmRefresh(true);
                  else void refreshAll();
                }}
              >
                ↻
              </button>
            </div>
          </div>
          {confirmRefresh && (
            <div
              className="product-delete-confirm"
              role="group"
              aria-label="판매 작성값 새로고침 확인"
            >
              <p>새로고침하면 작성한 변경을 취소하고 저장된 값을 다시 불러옵니다.</p>
              <div className="product-actions">
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() => void refreshAll()}
                >
                  변경 취소 후 새로고침
                </button>
                <button
                  type="button"
                  className="pagination-button"
                  onClick={() => setConfirmRefresh(false)}
                >
                  계속 작성
                </button>
              </div>
            </div>
          )}
          {expired && <p role="alert">날짜가 바뀌었습니다. 새로고침 전에는 적용할 수 없습니다.</p>}
          {closed && (
            <p className="field-help-text">
              주문 마감 시각이 지났습니다. 오늘 판매 조건은 변경할 수 없습니다.
            </p>
          )}
          <form className="sales-form" onSubmit={(event) => void submit(event)} noValidate>
            <fieldset
              className="sales-common-time"
              disabled={busy || closed || windowLoading || !windowReady}
            >
              <legend>공통 주문·수령 시간</legend>
              {windowLoading ? (
                <p role="status">저장된 시간을 확인하고 있습니다.</p>
              ) : !windowReady ? (
                <p>수령 시간을 확인하지 못했습니다. 다시 시도해 주세요.</p>
              ) : (
                <p className="field-help-text">오늘 판매하는 모든 상품에 적용됩니다.</p>
              )}
              <div className="sales-time-fields">
                <div className="field-group">
                  <label className="field-label" htmlFor="orderDeadline">
                    주문 마감
                  </label>
                  <input
                    type="time"
                    id="orderDeadline"
                    className="input-box"
                    value={windowInput.orderDeadline}
                    onChange={(event) =>
                      setWindowInput((previous) => ({
                        ...previous,
                        orderDeadline: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="pickupStart">
                    수령 시작
                  </label>
                  <input
                    type="time"
                    id="pickupStart"
                    className="input-box"
                    value={windowInput.startTime}
                    onChange={(event) =>
                      setWindowInput((previous) => ({ ...previous, startTime: event.target.value }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="pickupEnd">
                    수령 마감
                  </label>
                  <input
                    type="time"
                    id="pickupEnd"
                    className="input-box"
                    value={windowInput.endTime}
                    onChange={(event) =>
                      setWindowInput((previous) => ({ ...previous, endTime: event.target.value }))
                    }
                  />
                </div>
              </div>
            </fieldset>
            <p className="field-help-text">
              체크·가격·수량 변경은 ‘변경 사항 적용’을 누른 뒤 반영됩니다.
            </p>
            {loading ? (
              <p role="status">상품 목록을 불러오는 중입니다.</p>
            ) : rows.length === 0 ? (
              <p>등록한 상품이 없습니다. 상품 추가부터 시작하세요.</p>
            ) : (
              <table className="sale-table">
                <caption className="sr-only">오늘 판매 여부와 상품별 가격·수량</caption>
                <thead>
                  <tr>
                    <th scope="col">판매</th>
                    <th scope="col">상품·포장 규격</th>
                    <th scope="col">포장 가격(원)</th>
                    <th scope="col">판매 수량(포장)</th>
                    <th scope="col">현재 상태</th>
                    <th scope="col">수정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const product = row.product;
                    const draft = drafts[product.id] ?? draftOf(row);
                    const issue = issues.find((item) => item.productId === product.id);
                    const changed = drafts[product.id] !== undefined;
                    const status = row.selling
                      ? closed
                        ? "마감"
                        : row.onlineQuantity === 0
                          ? "품절"
                          : "판매 중"
                      : row.priceWon === null
                        ? "미판매"
                        : "판매 중단";
                    const pending = changed
                      ? row.selling !== draft.selling
                        ? draft.selling
                          ? "공개 예정"
                          : "중단 예정"
                        : "수정 예정"
                      : null;
                    return (
                      <tr
                        key={product.id}
                        className="sale-table-row"
                        data-product-id={product.id}
                        data-error={!!issue}
                      >
                        <td className="sale-check-cell">
                          <input
                            type="checkbox"
                            aria-label={`${product.name} 오늘 판매`}
                            checked={draft.selling}
                            disabled={busy || closed}
                            onChange={(event) => patch(row, { selling: event.target.checked })}
                          />
                        </td>
                        <th scope="row" className="sale-product-cell">
                          <button
                            type="button"
                            className="sale-product-name"
                            disabled={busy}
                            onClick={() => openProduct(product.id)}
                          >
                            {product.name}
                          </button>
                          <small>
                            {product.unitType === "WEIGHT"
                              ? product.unitAmount >= 1000
                                ? `${product.unitAmount / 1000}kg`
                                : `${product.unitAmount}g`
                              : `${product.unitAmount}개`}{" "}
                            / 포장
                            <span className="sale-mobile-state">
                              {" "}
                              · {status}
                              {pending ? ` · ${pending}` : ""}
                            </span>
                          </small>
                        </th>
                        <td className="sale-price-cell">
                          <label htmlFor={`sale-price-${product.id}`} className="sale-input-label">
                            포장 가격(원)
                          </label>
                          <input
                            id={`sale-price-${product.id}`}
                            className="input-box"
                            inputMode="numeric"
                            aria-label={`${product.name} 포장 가격`}
                            aria-invalid={!!issue}
                            aria-describedby={issue ? `sale-issue-${product.id}` : undefined}
                            disabled={busy || closed || !draft.selling}
                            value={draft.price}
                            onChange={(event) => patch(row, { price: event.target.value })}
                          />
                        </td>
                        <td className="sale-quantity-cell">
                          <label
                            htmlFor={`sale-quantity-${product.id}`}
                            className="sale-input-label"
                          >
                            수량(포장)
                          </label>
                          <input
                            id={`sale-quantity-${product.id}`}
                            className="input-box"
                            inputMode="numeric"
                            aria-label={`${product.name} 판매 수량`}
                            aria-invalid={!!issue}
                            aria-describedby={issue ? `sale-issue-${product.id}` : undefined}
                            disabled={busy || closed || !draft.selling}
                            value={draft.quantity}
                            onChange={(event) => patch(row, { quantity: event.target.value })}
                          />
                        </td>
                        <td className="sale-status-cell">
                          <span>{status}</span>
                          {pending && <small>{pending}</small>}
                          {issue && (
                            <div>
                              <p
                                id={`sale-issue-${product.id}`}
                                className="sale-row-error"
                                role="alert"
                              >
                                {issue.message}
                              </p>
                              <button
                                type="button"
                                className="pagination-button"
                                onClick={() => excludeChange(product.id)}
                              >
                                변경 제외
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="sale-edit-cell">
                          <button
                            type="button"
                            className="pagination-button"
                            aria-label={`${product.name} 상품 수정`}
                            disabled={busy}
                            onClick={() => openProduct(product.id)}
                          >
                            수정
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Pagination
              page={page}
              size={20}
              totalItems={totalItems}
              disabled={busy || loading}
              onPage={(next) => void loadList(next)}
              label="등록 상품 페이지"
            />
            {issues.some(
              (issue) =>
                issue.productId !== null && !rows.some((row) => row.product.id === issue.productId),
            ) && (
              <ul className="sale-row-error">
                {issues
                  .filter(
                    (issue) =>
                      issue.productId !== null &&
                      !rows.some((row) => row.product.id === issue.productId),
                  )
                  .map((issue) => (
                    <li key={issue.productId}>
                      {snapshots[issue.productId as number]?.product.name ??
                        `상품 ${issue.productId}`}
                      : {issue.message}
                      <button
                        type="button"
                        className="pagination-button"
                        aria-label={`${snapshots[issue.productId as number]?.product.name ?? `상품 ${issue.productId}`} 변경 제외`}
                        onClick={() => excludeChange(issue.productId as number)}
                      >
                        변경 제외
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            <div className="sales-apply-bar">
              <span>
                변경 상품 {changes.length}개{timeChanged ? " · 공통 시간 변경" : ""}
              </span>
              <button
                type="submit"
                className="btn-submit-primary"
                disabled={
                  busy ||
                  loading ||
                  !windowReady ||
                  expired ||
                  closed ||
                  (!changes.length && !timeChanged)
                }
              >
                {busy ? "적용 중…" : "변경 사항 적용"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
