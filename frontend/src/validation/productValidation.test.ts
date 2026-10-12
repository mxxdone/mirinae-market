import { describe, expect, it } from "vitest";
import { parseSaleUnit, parseOfferInput, tomorrowPickupDate } from "./productValidation";

describe("판매 구성 숫자 입력", () => {
  it("kg를 소수 잘라내기 없이 g로 변환한다", () => {
    expect(parseSaleUnit("WEIGHT", "3", "kg")).toBe(3000);
    expect(parseSaleUnit("WEIGHT", "0.1", "kg")).toBe(100);
    expect(parseSaleUnit("WEIGHT", "0.700", "kg")).toBe(700);
    expect(parseSaleUnit("WEIGHT", "3000", "g")).toBe(3000);
    expect(parseSaleUnit("COUNT", "12", "g")).toBe(12);
  });
  it.each(["0", "-1", "550", "1.5", "1e3", "", "2147483648"])(
    "잘못된 g 입력 %s를 거절한다",
    (value) => {
      expect(() => parseSaleUnit("WEIGHT", value, "g")).toThrow();
    },
  );
  it.each(["0", "0.15", "1.0001", "abc", "2147483.648"])(
    "잘못된 kg 입력 %s를 거절한다",
    (value) => {
      expect(() => parseSaleUnit("WEIGHT", value, "kg")).toThrow();
    },
  );
  it("가격은 양수이고 품절 수량 0은 허용한다", () => {
    expect(parseOfferInput("9000", "20")).toEqual({ priceWon: 9000, onlineQuantity: 20 });
    expect(parseOfferInput("1", "0")).toEqual({ priceWon: 1, onlineQuantity: 0 });
    for (const [price, quantity] of [
      ["0", "1"],
      ["1.5", "1"],
      ["1", "-1"],
      ["1", "1.2"],
      ["2147483648", "1"],
    ] as const) {
      expect(() => parseOfferInput(price, quantity)).toThrow();
    }
  });
  it("한국 시간 자정에 내일 날짜를 전환한다", () => {
    expect(tomorrowPickupDate(new Date("2026-10-12T14:59:59Z"))).toBe("2026-10-13");
    expect(tomorrowPickupDate(new Date("2026-10-12T15:00:00Z"))).toBe("2026-10-14");
  });
});
