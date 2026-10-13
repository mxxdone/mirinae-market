import type { SaleChange, SaleIssue } from "../api/types";
import { parseOfferInput } from "./productValidation";

export interface SaleDraft {
  productId: number;
  selling: boolean;
  price: string;
  quantity: string;
}
export function parseSaleDrafts(drafts: SaleDraft[]): {
  products: SaleChange[];
  issues: SaleIssue[];
} {
  if (drafts.length > 100)
    return {
      products: [],
      issues: [{ productId: null, message: "한 번에 변경 상품 100개까지 적용할 수 있습니다." }],
    };
  const products: SaleChange[] = [];
  const issues: SaleIssue[] = [];
  for (const draft of drafts) {
    try {
      products.push(
        draft.selling
          ? {
              productId: draft.productId,
              selling: true,
              ...parseOfferInput(draft.price, draft.quantity),
            }
          : { productId: draft.productId, selling: false, priceWon: null, onlineQuantity: null },
      );
    } catch (failure) {
      issues.push({
        productId: draft.productId,
        message: failure instanceof Error ? failure.message : "가격·수량을 확인해 주세요.",
      });
    }
  }
  return { products: issues.length ? [] : products, issues };
}
