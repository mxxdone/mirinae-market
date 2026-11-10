import { describe, it, expect } from "vitest";
import { isPickupCode, purchaseQuantity } from "./checkoutValidation";
describe("구매 수량", () => {
  it("양의 정수 경계", () => {
    expect(purchaseQuantity("1")).toBe(1);
    expect(purchaseQuantity("2147483647")).toBe(2147483647);
  });
  it.each(["", "0", "-1", "1.5", "2147483648", "1e2", " 2"])("잘못된 입력 %s", (input) => {
    expect(() => purchaseQuantity(input)).toThrow();
  });
});

describe("수령 코드", () => {
  it.each(["0000", "4821", "9999", "004821", "999999"])("신규 및 기존 코드 %s", (code) => {
    expect(isPickupCode(code)).toBe(true);
  });
  it.each(["", "123", "12345", "1234567", " 4821", "１２３４", "48a1"])("형식 오류 %s", (code) => {
    expect(isPickupCode(code)).toBe(false);
  });
});
