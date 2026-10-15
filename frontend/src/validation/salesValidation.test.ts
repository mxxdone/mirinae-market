import { describe, expect, it } from "vitest";
import { parseSaleDrafts } from "./salesValidation";

describe("일괄 판매 입력", () => {
  it("한 행이라도 잘못되면 전송할 변경 없이 모든 오류 행을 반환한다", () => {
    const result = parseSaleDrafts([
      { productId: 1, selling: true, price: "1000", quantity: "1" },
      { productId: 2, selling: true, price: "0", quantity: "2" },
      { productId: 3, selling: true, price: "1000", quantity: "-1" },
    ]);
    expect(result.products).toEqual([]);
    expect(result.issues.map((issue) => issue.productId)).toEqual([2, 3]);
  });
  it("중단은 이전 가격을 덮어쓰지 않고 수량 0은 판매 중 품절로 보낸다", () => {
    expect(
      parseSaleDrafts([
        { productId: 1, selling: false, price: "", quantity: "" },
        { productId: 2, selling: true, price: "1000", quantity: "0" },
      ]),
    ).toEqual({
      products: [
        { productId: 1, selling: false, priceWon: null, onlineQuantity: null },
        { productId: 2, selling: true, priceWon: 1000, onlineQuantity: 0 },
      ],
      issues: [],
    });
  });
  it("100행까지 허용하고 초과 변경은 전송하지 않는다", () => {
    const drafts = Array.from({ length: 100 }, (_, i) => ({
      productId: i + 1,
      selling: false,
      price: "",
      quantity: "",
    }));
    expect(parseSaleDrafts(drafts).products).toHaveLength(100);
    expect(
      parseSaleDrafts([...drafts, { productId: 101, selling: false, price: "", quantity: "" }])
        .issues,
    ).toHaveLength(1);
  });
});

it("작성 당시 재고 버전은 변환 뒤에도 유지한다", () => {
  const draft = { productId: 1, selling: true, price: "1000", quantity: "10", inventoryVersion: 0 };
  expect(parseSaleDrafts([draft]).products[0]?.inventoryVersion).toBe(0);
});
