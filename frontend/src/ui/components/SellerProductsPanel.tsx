import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  createProduct,
  updateProduct,
  getProducts,
  findProductOffer,
  savePickupWindow,
  saveOffer,
  getPickupWindow,
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
  tomorrowPickupDate,
} from "../../validation/productValidation";
import { StatusAlert } from "./StatusAlert";

export function SellerProductsPanel({
  store,
  onSessionExpired,
}: {
  store: StoreView;
  onSessionExpired: () => void;
}) {
  const [products, setProducts] = useState<ProductView[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
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
  const [date, setDate] = useState(tomorrowPickupDate);
  const [loading, setLoading] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [windowLoading, setWindowLoading] = useState(true);
  const [windowRegistered, setWindowRegistered] = useState<boolean | null>(null);
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
        const result = await getProducts(store.id, nextPage);
        if (!mounted.current || current !== listRequest.current) return;
        setProducts(result.items);
        setPage(nextPage);
        setHasNext(result.hasNext);
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
    const timer = setInterval(() => setDate(tomorrowPickupDate()), 30000);
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
    setStart("");
    setEnd("");
    void getPickupWindow(store.id, date, controller.signal)
      .then((window) => {
        if (active) {
          setWindowRegistered(window !== null);
          setWindowLoading(false);
          setStart(window?.startTime.slice(0, 5) ?? "14:00");
          setEnd(window?.endTime.slice(0, 5) ?? "18:00");
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
    setAmount(product ? String(product.unitAmount) : "");
    setWeightUnit("g");
    setError(null);
    setSuccess(null);
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
      setSuccess("상품 정보가 저장되었습니다. 아래에서 내일 판매 조건을 등록해 주세요.");
      await loadList(0);
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
      if (date !== tomorrowPickupDate()) {
        setDate(tomorrowPickupDate());
        throw new Error("수령 날짜가 바뀌었습니다. 새 날짜의 조건을 확인해 주세요.");
      }
      await savePickupWindow(store.id, date, { startTime: start, endTime: end });
      if (mounted.current) setWindowRegistered(true);
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
      if (date !== tomorrowPickupDate()) {
        setDate(tomorrowPickupDate());
        throw new Error("수령 날짜가 바뀌었습니다. 새 날짜의 조건을 확인해 주세요.");
      }
      const saved = await saveOffer(store.id, selected.id, date, input);
      if (!mounted.current) return;
      setOffer(saved);
      setSuccess("내일 판매가 공개되었습니다. 구매자가 시장에서 검색할 수 있습니다.");
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
          <span className="pill-badge primary">상인의 내일 준비</span>
          <h2 id="heading-products" className="summary-heading">
            상품과 내일 판매 관리
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
      <div className="seller-product-layout">
        <div className="seller-product-panel">
          <h2>등록 상품</h2>
          <p className="field-help-text">상품을 선택해 수정하거나 내일 판매를 등록하세요.</p>
          <button
            type="button"
            className="btn-query-store"
            disabled={busy}
            onClick={() => choose(null)}
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
                  onClick={() => choose(product)}
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
          <nav className="market-pagination" aria-label="등록 상품 페이지">
            <button
              type="button"
              className="text-action-link"
              disabled={page === 0 || busy || loading}
              onClick={() => void loadList(page - 1)}
            >
              이전
            </button>
            <span>{page + 1}페이지</span>
            <button
              type="button"
              className="text-action-link"
              disabled={!hasNext || busy || loading}
              onClick={() => void loadList(page + 1)}
            >
              다음
            </button>
            <button
              type="button"
              className="text-action-link"
              disabled={busy || loading}
              onClick={() => void loadList(page)}
            >
              새로고침
            </button>
          </nav>
        </div>
        <div className="seller-product-panel">
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
                disabled={busy || offerLoading || !!offer}
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
                  disabled={busy || offerLoading || !!offer}
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
                    disabled={busy || offerLoading || !!offer}
                    onChange={(event) => {
                      setWeightUnit(event.target.value === "kg" ? "kg" : "g");
                      setAmount("");
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
                disabled={busy || offerLoading || !!offer}
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
            {selected && (
              <p className="field-help-text">
                판매 이력이 있는 상품의 이름·구성 변경은 새 상품으로 등록하세요. 설명은 수정할 수
                있습니다.
              </p>
            )}
            <button
              type="submit"
              className="btn-submit-primary"
              disabled={busy || offerLoading || windowLoading}
            >
              {busy ? "저장 중…" : selected ? "상품 정보 저장" : "상품 등록"}
            </button>
          </form>
        </div>
        <div className="seller-product-panel">
          <h2>매장 수령 시간</h2>
          <p className="field-help-text">
            {windowLoading
              ? "저장된 시간을 확인하고 있습니다."
              : windowRegistered === null
                ? "수령 시간을 확인하지 못했습니다. 다시 시도해 주세요."
                : windowRegistered
                  ? "저장된 수령 시간을 불러왔습니다."
                  : "수령 시간을 먼저 저장해 주세요."}
          </p>
          <p className="field-help-text">{date} · 같은 날 모든 상품이 공유합니다.</p>
          <form className="market-form" onSubmit={(event) => void submitWindow(event)}>
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
        </div>
        <div className="seller-product-panel">
          <h2>내일 판매 등록</h2>
          {!selected ? (
            <p className="field-help-text">상품을 먼저 등록하거나 목록에서 선택해 주세요.</p>
          ) : offerLoading ? (
            <p role="status">기존 판매 조건을 확인하고 있습니다.</p>
          ) : (
            <>
              <p className="field-help-text">
                {selected.name} · {date} 수령
              </p>
              <form className="market-form" onSubmit={(event) => void submitSale(event)}>
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
                <button className="btn-submit-primary" type="submit" disabled={busy}>
                  {busy ? "저장 중…" : offer ? "판매 조건 수정" : "내일 판매 공개"}
                </button>
              </form>
              {offer && (
                <p className="comparison-price">
                  공개 가격: 포장당 {offer.priceWon.toLocaleString()}원 · {offer.comparisonUnit}당{" "}
                  {offer.comparisonPriceWon.toLocaleString("ko-KR", { minimumFractionDigits: 2 })}원
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
