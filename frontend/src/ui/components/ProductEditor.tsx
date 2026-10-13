import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createProduct, updateProduct, getProduct, deleteProduct } from "../../api/products";
import { ApiError, type ProductView, type UnitType } from "../../api/types";
import { parseSaleUnit, convertWeightInput } from "../../validation/productValidation";
import { StatusAlert } from "./StatusAlert";

export function ProductEditor({
  storeId,
  productId,
  onSaved,
  onDeleted,
  onBack,
  onSessionExpired,
}: {
  storeId: number;
  productId: number | null;
  onSaved: (product: ProductView) => Promise<void>;
  onDeleted: (id: number) => Promise<void>;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [product, setProduct] = useState<ProductView | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("WEIGHT");
  const [amount, setAmount] = useState("");
  const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g");
  const [loading, setLoading] = useState(productId !== null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const handleError = useCallback(
    (failure: unknown) => {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(failure instanceof Error ? failure.message : "상품을 저장하지 못했습니다.");
    },
    [onSessionExpired],
  );
  useEffect(() => {
    if (productId === null) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getProduct(storeId, productId, controller.signal)
      .then((value) => {
        if (!active) return;
        setProduct(value);
        setName(value.name);
        setDescription(value.description);
        setUnitType(value.unitType);
        const kg = value.unitType === "WEIGHT" && value.unitAmount >= 1000;
        setWeightUnit(kg ? "kg" : "g");
        setAmount(String(kg ? value.unitAmount / 1000 : value.unitAmount));
      })
      .catch((failure: unknown) => {
        if (active) handleError(failure);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [storeId, productId, refresh, handleError]);
  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalized = name.trim();
      if (
        !normalized ||
        [...normalized].length > 100 ||
        Array.from(normalized).some((c) => {
          const code = c.codePointAt(0) ?? 0;
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
      const saved = product
        ? await updateProduct(storeId, product.id, input)
        : await createProduct(storeId, input);
      if (mounted.current) await onSaved(saved);
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function removeProduct() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProduct(storeId, product.id);
      if (mounted.current) await onDeleted(product.id);
    } catch (failure) {
      handleError(failure);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="product-editor" aria-labelledby="heading-product-editor">
      <div className="product-list-heading">
        <h2 id="heading-product-editor">
          {productId === null ? "새 상품 등록" : "상품 정보 수정"}
        </h2>
        <button type="button" className="pagination-button" onClick={onBack} disabled={busy}>
          목록으로
        </button>
      </div>
      <StatusAlert message={error} onRetry={() => setRefresh((v) => v + 1)} />
      {loading ? (
        <p role="status">상품 정보를 불러오는 중입니다.</p>
      ) : productId !== null && product === null ? (
        <p>상품 정보를 확인한 뒤 수정할 수 있습니다.</p>
      ) : (
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
              disabled={busy || loading || !!product?.hasSales}
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
                disabled={busy || loading || !!product?.hasSales}
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
                  disabled={busy || loading || !!product?.hasSales}
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
              disabled={busy || loading || !!product?.hasSales}
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
          {product?.hasSales && (
            <p className="field-help-text">
              판매 이력이 있는 상품의 이름·구성 변경은 새 상품으로 등록하세요. 설명은 수정할 수
              있습니다.
            </p>
          )}
          <div className="product-actions">
            <button type="submit" className="btn-submit-primary" disabled={busy || loading}>
              {busy ? "저장 중…" : product ? "상품 정보 저장" : "상품 등록"}
            </button>
            {product && (
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
          {confirmDelete && product && (
            <div className="product-delete-confirm" role="group" aria-label="상품 삭제 확인">
              <p>
                ‘{product.name}’ 상품을 삭제할까요? 공개 판매도 종료되며 판매 기록은 보존됩니다.
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
      )}
    </section>
  );
}
