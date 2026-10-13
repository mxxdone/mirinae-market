import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  createProduct,
  updateProduct,
  getProducts,
  findProductOffer,
  savePickupWindow,
  saveOffer,
  getPickupWindow,
  deleteProduct,
} from "../../api/products";
import {
  ApiError,
  type OfferView,
  type ProductView,
  type StoreView,
  type UnitType,
} from "../../api/types";
import {
  parseOfferInput,
  parseSaleUnit,
  todayPickupDate,
  convertWeightInput,
} from "../../validation/productValidation";
import { StatusAlert } from "./StatusAlert";
import { Pagination } from "./Pagination";

const PRODUCT_PAGE_SIZE = 5;
const SELLER_TABS = ["상품 목록", "상품 정보", "오늘 판매"] as const;

export function SellerProductsPanel({
  store,
  onSessionExpired,
}: {
  store: StoreView;
  onSessionExpired: () => void;
}) {
  const [products, setProducts] = useState<ProductView[]>([]);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const saleHeading = useRef<HTMLHeadingElement>(null);
  const [selected, setSelected] = useState<ProductView | null>(null);
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("WEIGHT");
  const [amount, setAmount] = useState("");
  const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("18:00");
  const [deadline, setDeadline] = useState("13:00");
  const [date, setDate] = useState(todayPickupDate);
  const [loading, setLoading] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [windowLoading, setWindowLoading] = useState(true);
  const [windowRegistered, setWindowRegistered] = useState<boolean | null>(null);
  const [savedWindow, setSavedWindow] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const mounted = useRef(true);
  const listRequest = useRef(0);
  const handleError = useCallback(
    (failure: unknown) => {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onSessionExpired();
        return;
      }
      setError(
        failure instanceof Error ? failure.message : "처리하지 못했습니다. 다시 시도해 주세요.",
      );
    },
    [onSessionExpired],
  );
  const loadList = useCallback(
    async (nextPage: number) => {
      const current = ++listRequest.current;
      setLoading(true);
      setError(null);
      try {
        const result = await getProducts(store.id, nextPage, PRODUCT_PAGE_SIZE);
        if (!mounted.current || current !== listRequest.current) return;
        setProducts(result.items);
        setPage(nextPage);
        setTotalItems(result.totalItems);
      } catch (failure) {
        if (current === listRequest.current) handleError(failure);
      } finally {
        if (mounted.current && current === listRequest.current) setLoading(false);
      }
    },
    [store.id, handleError],
  );
  useEffect(() => {
    mounted.current = true;
    void loadList(0);
    const timer = setInterval(() => setDate(todayPickupDate()), 30000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [loadList]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setOffer(null);
    setPrice("");
    setQuantity("");
    if (!selected) {
      setOfferLoading(false);
      return;
    }
    setOfferLoading(true);
    async function loadExisting() {
      try {
        const existing = await findProductOffer(store, selected as ProductView, controller.signal);
        if (!active) return;
        setOffer(existing);
        if (existing) {
          setPrice(String(existing.priceWon));
          setQuantity(String(existing.onlineQuantity));
        }
      } catch (failure) {
        if (active) handleError(failure);
      } finally {
        if (active) setOfferLoading(false);
      }
    }
    void loadExisting();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, store, date, handleError, refreshVersion]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWindowLoading(true);
    setWindowRegistered(null);
    setSavedWindow(null);
    setStart("");
    setEnd("");
    setDeadline("");
    void getPickupWindow(store.id, date, controller.signal)
      .then((window) => {
        if (active) {
          setWindowRegistered(window !== null);
          setWindowLoading(false);
          setStart(window?.startTime.slice(0, 5) ?? "14:00");
          setEnd(window?.endTime.slice(0, 5) ?? "18:00");
          setDeadline(window?.orderDeadline.slice(0, 5) ?? "13:00");
          setSavedWindow(
            window
              ? `${window.orderDeadline.slice(0, 5)}|${window.startTime.slice(0, 5)}|${window.endTime.slice(0, 5)}`
              : null,
          );
        }
      })
      .catch((failure: unknown) => {
        if (active) handleError(failure);
      })
      .finally(() => {
        if (active) setWindowLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [store.id, date, handleError, refreshVersion]);
  function choose(product: ProductView | null) {
    setSelected(product);
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setUnitType(product?.unitType ?? "WEIGHT");
    const displayKg = product?.unitType === "WEIGHT" && product.unitAmount >= 1000;
    setAmount(product ? String(displayKg ? product.unitAmount / 1000 : product.unitAmount) : "");
    setWeightUnit(displayKg ? "kg" : "g");
    setConfirmDelete(false);
    setError(null);
    setSuccess(null);
  }
  function showSale() {
    setActiveTab(2);
    requestAnimationFrame(() => {
      saleHeading.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      saleHeading.current?.focus({ preventScroll: true });
    });
  }
  async function removeProduct() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteProduct(store.id, selected.id);
      if (!mounted.current) return;
      choose(null);
      setActiveTab(0);
      setSuccess("상품이 삭제되었습니다. 판매 기록은 보존되며 공개 판매도 종료됩니다.");
      await loadList(
        Math.min(page, Math.max(0, Math.ceil((totalItems - 1) / PRODUCT_PAGE_SIZE) - 1)),
      );
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const normalized = name.trim();
      if (
        !normalized ||
        [...normalized].length > 100 ||
        Array.from(normalized).some((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code < 32 || (code >= 127 && code <= 159);
        })
      )
        throw new Error("상품명은 제어 문자 없이 1~100자로 입력해 주세요.");
      if ([...description.trim()].length > 1000) throw new Error("설명은 최대 1,000자입니다.");
      const input = {
        name: normalized,
        description: description.trim(),
        unitType,
        unitAmount: parseSaleUnit(unitType, amount, weightUnit),
      };
      const saved = selected
        ? await updateProduct(store.id, selected.id, input)
        : await createProduct(store.id, input);
      if (!mounted.current) return;
      choose(saved);
      setSuccess("상품 정보가 저장되었습니다. 오늘 판매할 가격과 수량을 설정해 주세요.");
      await loadList(0);
      showSale();
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submitWindow(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      if (!start || !end || start >= end) throw new Error("수령 시작은 마감보다 빨라야 합니다.");
      if (!deadline || deadline > start)
        throw new Error("주문 마감은 수령 시작보다 늦을 수 없습니다.");
      if (date !== todayPickupDate()) {
        setDate(todayPickupDate());
        throw new Error("수령 날짜가 바뀌었습니다. 새 날짜의 조건을 확인해 주세요.");
      }
      await savePickupWindow(store.id, date, {
        startTime: start,
        endTime: end,
        orderDeadline: deadline,
      });
      if (mounted.current) {
        setWindowRegistered(true);
        setSavedWindow(`${deadline}|${start}|${end}`);
      }
      if (mounted.current)
        setSuccess("매장 수령 시간이 저장되었습니다. 같은 날 모든 상품이 이 시간을 공유합니다.");
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submitSale(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const input = parseOfferInput(price, quantity);
      if (
        windowLoading ||
        windowRegistered !== true ||
        savedWindow !== `${deadline}|${start}|${end}`
      )
        throw new Error("판매를 시작하기 전에 매장 공통 시간을 확인하고 저장해 주세요.");
      if (date !== todayPickupDate()) {
        setDate(todayPickupDate());
        throw new Error("수령 날짜가 바뀌었습니다. 새 날짜의 조건을 확인해 주세요.");
      }
      const saved = await saveOffer(store.id, selected.id, date, input);
      if (!mounted.current) return;
      setOffer(saved);
      setSuccess("오늘 판매가 공개되었습니다. 구매자가 시장에서 검색할 수 있습니다.");
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section aria-labelledby="heading-products" className="seller-products">
      <div className="summary-tag-row">
        <div>
          <h2 id="heading-products" className="summary-heading">
            판매 관리
          </h2>
        </div>
        <span className="field-help-text">{date} 수령 · 한국 시간 기준</span>
      </div>
      <StatusAlert
        message={error}
        onRetry={() => {
          setRefreshVersion((version) => version + 1);
          void loadList(page);
        }}
      />
      {success && (
        <p role="status" className="market-success">
          {success}
        </p>
      )}
      <div className="seller-mobile-tabs" role="tablist" aria-label="판매 관리 화면">
        {SELLER_TABS.map((label, index) => (
          <button
            key={label}
            id={`seller-tab-${index}`}
            type="button"
            role="tab"
            aria-controls={`seller-panel-${index}`}
            aria-selected={activeTab === index}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % SELLER_TABS.length
                  : event.key === "ArrowLeft"
                    ? (index + SELLER_TABS.length - 1) % SELLER_TABS.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? SELLER_TABS.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setActiveTab(next);
              document.getElementById(`seller-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="seller-product-layout">
        <div
          className="seller-product-panel seller-tab-panel"
          id="seller-panel-0"
          role="tabpanel"
          aria-labelledby="seller-tab-0"
          data-active={activeTab === 0}
        >
          <div className="product-list-heading">
            <h2>등록 상품</h2>
            <button
              type="button"
              className="pagination-button"
              aria-label="상품 목록 새로고침"
              title="새로고침"
              disabled={busy || loading}
              onClick={() => void loadList(page)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M20 7v5h-5" />
                <path d="M20 12a8 8 0 1 0-2.3 5.7M20 7l-2.3-2.3" />
              </svg>
            </button>
          </div>
          <p className="field-help-text">상품을 선택해 수정하거나 오늘 판매를 등록하세요.</p>
          <button
            type="button"
            className="btn-query-store new-product-button"
            disabled={busy}
            onClick={() => {
              choose(null);
              setActiveTab(1);
            }}
          >
            새 상품 등록
          </button>
          {loading ? (
            <p role="status">상품 목록을 불러오는 중입니다.</p>
          ) : products.length === 0 ? (
            <p className="field-help-text">아직 등록된 상품이 없습니다.</p>
          ) : (
            <div className="seller-product-list">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="seller-product-choice"
                  aria-pressed={selected?.id === product.id}
                  disabled={busy}
                  onClick={() => {
                    choose(product);
                    setActiveTab(1);
                  }}
                >
                  <span>
                    {product.name}
                    <br />
                    <small>
                      {product.unitAmount.toLocaleString()}
                      {product.unitType === "WEIGHT" ? "g" : "개"} / 포장
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
          <Pagination
            page={page}
            size={PRODUCT_PAGE_SIZE}
            totalItems={totalItems}
            disabled={busy || loading}
            onPage={(next) => void loadList(next)}
            label="등록 상품 페이지"
          />
        </div>
        <div
          className="seller-product-panel seller-tab-panel"
          id="seller-panel-1"
          role="tabpanel"
          aria-labelledby="seller-tab-1"
          data-active={activeTab === 1}
        >
          <h2>{selected ? "상품 정보 수정" : "새 상품 등록"}</h2>
          <form className="market-form" onSubmit={(event) => void submitProduct(event)}>
            <div className="field-group">
              <label className="field-label" htmlFor="productName">
                상품명
              </label>
              <input
                id="productName"
                className="input-box"
                maxLength={100}
                required
                value={name}
                disabled={busy || offerLoading || !!selected?.hasSales || !!offer}
                onChange={(event) => setName(event.target.value)}
                placeholder="국내산 양파 3kg"
              />
            </div>
            <div className="product-form-row">
              <div className="field-group">
                <label className="field-label" htmlFor="productUnitType">
                  판매 구성 방식
                </label>
                <select
                  id="productUnitType"
                  className="input-box"
                  value={unitType}
                  disabled={busy || offerLoading || !!selected?.hasSales || !!offer}
                  onChange={(event) => {
                    setUnitType(event.target.value === "COUNT" ? "COUNT" : "WEIGHT");
                    setAmount("");
                  }}
                >
                  <option value="WEIGHT">중량</option>
                  <option value="COUNT">개수</option>
                </select>
              </div>
              {unitType === "WEIGHT" && (
                <div className="field-group">
                  <label className="field-label" htmlFor="weightUnit">
                    중량 단위
                  </label>
                  <select
                    id="weightUnit"
                    className="input-box"
                    value={weightUnit}
                    disabled={busy || offerLoading || !!selected?.hasSales || !!offer}
                    onChange={(event) => {
                      const nextUnit = event.target.value === "kg" ? "kg" : "g";
                      try {
                        setAmount(convertWeightInput(amount, weightUnit, nextUnit));
                        setWeightUnit(nextUnit);
                        setError(null);
                      } catch (failure) {
                        handleError(failure);
                      }
                    }}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              )}
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="productUnitAmount">
                {unitType === "WEIGHT" ? "한 포장 중량" : "한 포장 개수"} (
                {unitType === "COUNT" ? "개" : weightUnit})
              </label>
              <input
                id="productUnitAmount"
                className="input-box"
                inputMode={unitType === "WEIGHT" && weightUnit === "kg" ? "decimal" : "numeric"}
                required
                value={amount}
                disabled={busy || offerLoading || !!selected?.hasSales || !!offer}
                onChange={(event) => setAmount(event.target.value)}
              />
              <p className="field-help-text">
                {unitType === "WEIGHT"
                  ? "100g(0.1kg)의 배수로 입력하세요. 상품명에서 중량을 추출하지 않습니다."
                  : "한 포장에 포함되는 양의 정수 개수를 입력하세요."}
              </p>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="productDescription">
                상품 설명 (선택)
              </label>
              <textarea
                id="productDescription"
                className="input-box product-textarea"
                maxLength={1000}
                value={description}
                disabled={busy}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {(selected?.hasSales || offer) && (
              <p className="field-help-text">
                판매 이력이 있는 상품의 이름·구성 변경은 새 상품으로 등록하세요. 설명은 수정할 수
                있습니다.
              </p>
            )}
            <div className="product-actions">
              {selected && (
                <button type="button" className="pagination-button" onClick={showSale}>
                  오늘 판매 설정
                </button>
              )}
              <button
                type="submit"
                className="btn-submit-primary"
                disabled={busy || offerLoading || windowLoading}
              >
                {busy ? "저장 중…" : selected ? "상품 정보 저장" : "상품 등록"}
              </button>
              {selected && (
                <button
                  type="button"
                  className="product-delete-button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  상품 삭제
                </button>
              )}
            </div>
            {confirmDelete && selected && (
              <div className="product-delete-confirm" role="group" aria-label="상품 삭제 확인">
                <p>
                  ‘{selected.name}’ 상품을 삭제할까요? 공개 판매도 종료되며 판매 기록은 보존됩니다.
                </p>
                <div className="product-actions">
                  <button
                    type="button"
                    className="product-delete-button"
                    disabled={busy}
                    onClick={() => void removeProduct()}
                  >
                    삭제 확인
                  </button>
                  <button
                    type="button"
                    className="pagination-button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
        <div
          className="seller-sale-panels seller-tab-panel"
          id="seller-panel-2"
          role="tabpanel"
          aria-labelledby="seller-tab-2"
          data-active={activeTab === 2}
        >
          <div className="seller-product-panel">
            <h2 ref={saleHeading} tabIndex={-1}>
              오늘 판매 설정
            </h2>
            {!selected ? (
              <p className="field-help-text">
                상품을 등록하거나 목록에서 선택하면 오늘 판매할 가격·수량을 설정할 수 있습니다.
              </p>
            ) : offerLoading ? (
              <p role="status">기존 판매 조건을 확인하고 있습니다.</p>
            ) : (
              <>
                <p className="field-help-text">
                  {selected.name} · {date} 수령
                </p>
                <form
                  id="seller-sale-form"
                  className="market-form"
                  onSubmit={(event) => void submitSale(event)}
                >
                  <div className="field-group">
                    <label className="field-label" htmlFor="offerPrice">
                      한 포장 가격 (원)
                    </label>
                    <input
                      id="offerPrice"
                      className="input-box"
                      inputMode="numeric"
                      required
                      value={price}
                      disabled={busy}
                      onChange={(event) => setPrice(event.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="offerQuantity">
                      온라인 판매 수량 (포장)
                    </label>
                    <input
                      id="offerQuantity"
                      className="input-box"
                      inputMode="numeric"
                      required
                      value={quantity}
                      disabled={busy}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                    <p className="field-help-text">
                      0은 품절입니다. 현장 재고와 구분해 준비해 주세요.
                    </p>
                  </div>
                </form>
                {offer && (
                  <p className="comparison-price">
                    공개 가격: 포장당 {offer.priceWon.toLocaleString()}원 · {offer.comparisonUnit}당{" "}
                    {offer.comparisonPriceWon.toLocaleString("ko-KR", { minimumFractionDigits: 2 })}
                    원
                  </p>
                )}
              </>
            )}
          </div>
          <div className="seller-product-panel">
            <h2>오늘 주문·수령 시간</h2>
            <p className="field-help-text">
              {windowLoading
                ? "저장된 시간을 확인하고 있습니다."
                : windowRegistered === null
                  ? "수령 시간을 확인하지 못했습니다. 다시 시도해 주세요."
                  : windowRegistered
                    ? "저장된 수령 시간을 불러왔습니다."
                    : "판매를 시작하기 전에 매장 공통 시간을 저장해 주세요."}
            </p>
            <p className="field-help-text">{date} · 같은 날 모든 상품이 공유합니다.</p>
            {savedWindow !== null && savedWindow !== `${deadline}|${start}|${end}` && (
              <p className="field-help-text">
                변경한 시간을 저장한 뒤 판매를 시작하세요. 오늘의 모든 상품에 적용됩니다.
              </p>
            )}
            <form className="market-form" onSubmit={(event) => void submitWindow(event)}>
              <div className="field-group">
                <label className="field-label" htmlFor="orderDeadline">
                  주문 마감
                </label>
                <input
                  type="time"
                  id="orderDeadline"
                  className="input-box"
                  required
                  value={deadline}
                  disabled={busy || offerLoading || windowLoading}
                  onChange={(event) => setDeadline(event.target.value)}
                />
                <p className="field-help-text">
                  수령 시작보다 늦지 않게 설정하세요. 마감 정각부터 주문을 받지 않습니다.
                </p>
              </div>
              <div className="product-form-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="pickupStart">
                    수령 시작
                  </label>
                  <input
                    type="time"
                    id="pickupStart"
                    className="input-box"
                    required
                    value={start}
                    disabled={busy || offerLoading || windowLoading}
                    onChange={(event) => setStart(event.target.value)}
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
                    required
                    value={end}
                    disabled={busy || offerLoading || windowLoading}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </div>
              </div>
              <button
                className="btn-submit-primary"
                type="submit"
                disabled={busy || offerLoading || windowLoading}
              >
                수령 시간 저장
              </button>
            </form>
            {selected && !offerLoading && (
              <button
                className="btn-submit-primary sale-publish-button"
                type="submit"
                form="seller-sale-form"
                disabled={
                  busy ||
                  windowLoading ||
                  windowRegistered !== true ||
                  savedWindow !== `${deadline}|${start}|${end}`
                }
              >
                {busy ? "저장 중…" : offer ? "판매 조건 저장" : "오늘 판매 시작"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
