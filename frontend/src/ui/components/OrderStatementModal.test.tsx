import { describe, expect, it } from "vitest";
import { formatSeoulTimestamp } from "./OrderStatementModal";

describe("formatSeoulTimestamp", () => {
  it("UTC ISO 시각을 한국 시간 YYYY-MM-DD HH:mm:ss 형식으로 변환한다", () => {
    // 2026-10-20 01:30:00 UTC -> 2026-10-20 10:30:00 KST
    expect(formatSeoulTimestamp("2026-10-20T01:30:00Z")).toBe("2026-10-20 10:30:00");
  });

  it("UTC 날짜 변경 경계(15:00:00Z)에서 한국 시간의 다음 날짜 00:00:00을 반환한다", () => {
    // 2026-10-20 15:00:00 UTC -> 2026-10-21 00:00:00 KST
    expect(formatSeoulTimestamp("2026-10-20T15:00:00Z")).toBe("2026-10-21 00:00:00");
  });

  it("밀리초 및 오프셋이 포함된 시각도 정확히 한국 시간으로 변환한다", () => {
    expect(formatSeoulTimestamp("2026-10-20T01:30:00.123Z")).toBe("2026-10-20 10:30:00");
    expect(formatSeoulTimestamp("2026-10-20T10:30:00+09:00")).toBe("2026-10-20 10:30:00");
  });

  it("null, undefined 또는 잘못된 날짜 문자열에 대해 안전하게 대시(-)를 반환한다", () => {
    expect(formatSeoulTimestamp(null)).toBe("-");
    expect(formatSeoulTimestamp(undefined)).toBe("-");
    expect(formatSeoulTimestamp("not-a-date")).toBe("-");
  });
});
