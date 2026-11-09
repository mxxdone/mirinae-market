import { describe, expect, it } from "vitest";
import { readDirectPurchaseLocation } from "./purchaseLocation";

describe("바로 구매 주소", () => {
  it("상품과 선택 수량을 복원한다", () => {
    expect(readDirectPurchaseLocation("#buy?market=2&offer=7&quantity=3")).toEqual({
      marketId: 2,
      offerId: 7,
      quantity: 3,
    });
  });
  it("누락·잘못된 수량·정수 범위를 벗어난 식별자를 구매 요청으로 복원하지 않는다", () => {
    for (const hash of [
      "#cart",
      "#buy?market=1&offer=2",
      "#buy?market=1&offer=2&quantity=0",
      "#buy?market=1&offer=2&quantity=1.5",
      "#buy?market=1&offer=2&quantity=2147483648",
      "#buy?market=9007199254740992&offer=2&quantity=1",
    ])
      expect(readDirectPurchaseLocation(hash)).toBeNull();
  });
});
