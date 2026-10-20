import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAsOfSeoul, getCurrentMonthSeoul, getTodayDateSeoul } from "./SellerDashboardPanel";

afterEach(() => {
  vi.useRealTimers();
});

describe("대시보드 한국 시간 경계", () => {
  it("UTC 월말 오후 3시부터 다음 달의 날짜와 월을 기본값으로 사용한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T14:59:59Z"));
    expect(getTodayDateSeoul()).toBe("2026-10-31");
    expect(getCurrentMonthSeoul()).toBe("2026-10");
    vi.setSystemTime(new Date("2026-10-31T15:00:00Z"));
    expect(getTodayDateSeoul()).toBe("2026-11-01");
    expect(getCurrentMonthSeoul()).toBe("2026-11");
  });

  it("조회 기준 시각도 한국 시간의 다음 날짜로 표시한다", () => {
    expect(formatAsOfSeoul("2026-12-31T15:00:00Z")).toBe("2027. 01. 01. 00:00:00");
  });

  it("잘못된 기준 시각을 현재 시각으로 바꾸지 않는다", () => {
    expect(formatAsOfSeoul("invalid-date")).toBe("invalid-date");
  });
});
