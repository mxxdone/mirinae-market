import type { Page } from "@playwright/test";

/** 실제 백엔드의 e2e 프로필과 브라우저가 같은 시간을 사용한다. */
export async function installTestClock(page: Page): Promise<void> {
  const value = process.env.E2E_FIXED_INSTANT;
  if (!value || Number.isNaN(Date.parse(value)))
    throw new Error("E2E_FIXED_INSTANT에 백엔드와 동일한 ISO 시각을 설정해 주세요.");
  await page.clock.install({ time: new Date(value) });
}
