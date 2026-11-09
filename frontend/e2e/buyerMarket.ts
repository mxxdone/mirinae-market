import { expect, type Page } from "@playwright/test";

export async function openBuyerProducts(page: Page) {
  await expect(page.locator("#heading-market")).toBeVisible();
  if (await page.locator("#marketResults").isVisible()) {
    await page.locator("#marketResults button").first().click();
  }
  await expect(page.locator("#productSearch")).toBeVisible();
}

export async function chooseBuyerMarket(page: Page, market: string | { label: string }) {
  await expect(page.locator("#heading-market")).toBeVisible();
  if (await page.locator("#btnChangeBuyerMarket").isVisible()) {
    await page.locator("#btnChangeBuyerMarket").click();
  }
  await expect(page.locator("#marketResults button").first()).toBeVisible();
  const target =
    typeof market === "string"
      ? page.locator(`button[data-market-id="${market}"]`)
      : page.getByRole("button", { name: market.label, exact: true });
  while ((await target.count()) === 0) {
    const next = page
      .getByRole("navigation", { name: "시장 검색 결과 페이지" })
      .getByRole("button", { name: "다음 페이지" });
    await expect(next).toBeEnabled();
    await next.click();
  }
  await target.click();
  await expect(page.locator("#productSearch")).toBeVisible();
}
