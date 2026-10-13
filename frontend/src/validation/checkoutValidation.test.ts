import { describe, it, expect } from "vitest";
import { purchaseQuantity } from "./checkoutValidation";
describe("구매 수량", () => {
  it("양의 정수 경계", () => {
    expect(purchaseQuantity("1")).toBe(1);
    expect(purchaseQuantity("2147483647")).toBe(2147483647);
  });
  it.each(["", "0", "-1", "1.5", "2147483648", "1e2", " 2"])("잘못된 입력 %s", (input) => {
    expect(() => purchaseQuantity(input)).toThrow();
  });
});
