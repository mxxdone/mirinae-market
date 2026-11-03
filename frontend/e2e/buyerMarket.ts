import { expect, type Page } from "@playwright/test";

export async function openBuyerProducts(page: Page) {
  await expect(page.locator("#heading-market")).toBeVisible();
  if (await page.locator("#btnConfirmBuyerMarket").isVisible()) {
    await page.locator("#btnConfirmBuyerMarket").click();
  }
  await expect(page.locator("#productSearch")).toBeVisible();
}

export async function chooseBuyerMarket(page: Page, market: string | { label: string }) {
  await expect(page.locator("#heading-market")).toBeVisible();
  if (await page.locator("#btnChangeBuyerMarket").isVisible()) {
    await page.locator("#btnChangeBuyerMarket").click();
  }
  await page.locator("#marketSelect").selectOption(market);
  await page.locator("#btnConfirmBuyerMarket").click();
  await expect(page.locator("#productSearch")).toBeVisible();
}
