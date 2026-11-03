import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";
import { formatUnit, formatWon, getSellerDashboard, type SellerDashboardView } from "./dashboard";

describe("dashboard API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSellerDashboard", () => {
    const mockResponse: SellerDashboardView = {
      asOf: "2026-10-20T03:00:00Z",
      date: "2026-10-20",
      month: "2026-10",
      daily: {
        totalOrders: 10,
        waitingOrders: 4,
        pickedUpOrders: 3,
        noShowOrders: 1,
        cancelledOrders: 2,
        partiallyCancelledOrders: 1,
      },
      preparationItems: [
        {
          productId: 1,
          productName: "사과",
          unitType: "COUNT",
          unitAmount: 1,
          quantity: 5,
        },
      ],
      lifetime: {
        orderCount: 8,
        buyerCount: 5,
        paymentWon: "100000",
        refundWon: "10000",
        netWon: "90000",
      },
      monthly: {
        paymentWon: "50000",
        refundWon: "5000",
        netWon: "45000",
      },
    };

    it("파라미터가 없으면 쿼리 파라미터 없이 호출한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      const result = await getSellerDashboard(42);

      expect(apiGetSpy).toHaveBeenCalledWith("/api/seller/stores/42/dashboard", undefined);
      expect(result).toEqual(mockResponse);
    });

    it("date 파라미터를 올바르게 전달한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      await getSellerDashboard(42, { date: "2026-10-20" });

      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/seller/stores/42/dashboard?date=2026-10-20",
        undefined,
      );
    });

    it("month 파라미터를 올바르게 전달한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      await getSellerDashboard(42, { month: "2026-10" });

      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/seller/stores/42/dashboard?month=2026-10",
        undefined,
      );
    });

    it("date와 month 파라미터를 함께 전달한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);

      await getSellerDashboard(42, { date: "2026-10-20", month: "2026-10" });

      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/seller/stores/42/dashboard?date=2026-10-20&month=2026-10",
        undefined,
      );
    });

    it("AbortSignal을 올바르게 전달한다", async () => {
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockResponse);
      const controller = new AbortController();

      await getSellerDashboard(42, { date: "2026-10-20" }, controller.signal);

      expect(apiGetSpy).toHaveBeenCalledWith(
        "/api/seller/stores/42/dashboard?date=2026-10-20",
        controller.signal,
      );
    });
  });

  describe("formatWon", () => {
    it("금액 문자열을 콤마가 포함된 원화로 포맷팅한다", () => {
      expect(formatWon("10000")).toBe("10,000원");
      expect(formatWon("123456789")).toBe("123,456,789원");
    });

    it("0원 및 음수 금액을 포맷팅한다", () => {
      expect(formatWon("0")).toBe("0원");
      expect(formatWon("-5000")).toBe("-5,000원");
    });

    it("MAX_SAFE_INTEGER 초과 금액도 BigInt로 손실 없이 포맷팅한다", () => {
      expect(formatWon("9007199254740993")).toBe("9,007,199,254,740,993원");
    });

    it("빈 문자열, 소수점, 비숫자 등 유효하지 않은 입력은 확인 불가로 표시한다", () => {
      expect(formatWon("")).toBe("확인 불가");
      expect(formatWon("   ")).toBe("확인 불가");
      expect(formatWon("invalid")).toBe("확인 불가");
      expect(formatWon("12.34")).toBe("확인 불가");
    });
  });

  describe("formatUnit", () => {
    it("WEIGHT 단위는 g로 표시한다", () => {
      expect(formatUnit("WEIGHT", 500)).toBe("500g");
      expect(formatUnit("WEIGHT", 1000)).toBe("1000g");
    });

    it("COUNT 단위는 개로 표시한다", () => {
      expect(formatUnit("COUNT", 1)).toBe("1개");
      expect(formatUnit("COUNT", 10)).toBe("10개");
    });
  });
});
