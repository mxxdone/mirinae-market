import { expect, test, type Page } from "@playwright/test";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}을 설정해 주세요.`);
  return value;
}
async function login(page: Page, id: string) {
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("판매자 kg 입력→내일 공개→구매자 시장 검색·상세·타 시장 격리", async ({ page, browser }) => {
  const name = `양파 ${Date.now()} 3kg`;
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.locator("#heading-products")).toBeVisible();
  await page.locator("#productName").fill(name);
  await page.locator("#weightUnit").selectOption("kg");
  await page.locator("#productUnitAmount").fill("3");
  await page.locator("#productDescription").fill("한 포장 3kg, 내일 매장 방문 수령");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByText("상품 정보가 저장되었습니다.", { exact: false })).toBeVisible();
  await page.locator("#pickupStart").fill("15:00");
  await page.locator("#pickupEnd").fill("19:00");
  await page.getByRole("button", { name: "수령 시간 저장", exact: true }).click();
  await expect(page.getByText("매장 수령 시간이 저장되었습니다.", { exact: false })).toBeVisible();
  await page.locator("#offerPrice").fill("9000");
  await page.locator("#offerQuantity").fill("20");
  await page.getByRole("button", { name: "내일 판매 공개", exact: true }).click();
  await expect(page.getByText("내일 판매가 공개되었습니다.", { exact: false })).toBeVisible();
  await expect(page.getByText("100g당 300.00원", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.locator("#pickupStart")).toHaveValue("15:00");
  await expect(page.locator("#pickupEnd")).toHaveValue("19:00");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: "../output/playwright/phase3-seller-mobile.png", fullPage: true });
  const buyer = await browser.newContext();
  try {
    const buyerPage = await buyer.newPage();
    await login(buyerPage, required("E2E_BUYER_LOGIN_ID"));
    await buyerPage.getByRole("button", { name: "시장 상품 둘러보기" }).click();
    await buyerPage.locator("#marketSelect").selectOption({ label: "미리내시장" });
    await buyerPage.locator("#productSearch").fill(name);
    await buyerPage.getByRole("button", { name: "상품 검색", exact: true }).click();
    const card = buyerPage.locator(".offer-card").filter({ hasText: name });
    await expect(card).toContainText("9,000");
    await expect(card).toContainText("100g당 300.00원");
    await expect(card).toContainText("3,000g");
    await buyerPage.screenshot({
      path: "../output/playwright/phase3-buyer-desktop.png",
      fullPage: true,
    });
    await card.getByRole("button", { name: /^상품 상세 보기/ }).click();
    await expect(buyerPage.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(buyerPage.locator(".offer-facts")).toContainText("15:00~19:00");
    await buyerPage.setViewportSize({ width: 390, height: 844 });
    await noOverflow(buyerPage);
    await buyerPage.screenshot({
      path: "../output/playwright/phase3-buyer-mobile.png",
      fullPage: true,
    });
    await buyerPage.locator("#marketSelect").selectOption({ label: "은하시장" });
    await expect(buyerPage.getByRole("heading", { name, exact: true })).toHaveCount(0);
    await buyerPage.locator("#productSearch").fill(name);
    await buyerPage.getByRole("button", { name: "상품 검색", exact: true }).click();
    await expect(buyerPage.locator(".offer-card")).toHaveCount(0);
    await expect(buyerPage.getByText("내일 판매할 상품을 기다리고 있어요")).toBeVisible();
  } finally {
    await buyer.close();
  }
});

test("입력 실패·통신 실패를 성공으로 표시하지 않고 세션 만료 시 매장 상태를 폐기", async ({
  page,
  context,
}) => {
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.locator("#heading-products")).toBeVisible();
  await page.locator("#productName").fill(`실패검증${Date.now()}`);
  await page.locator("#productUnitAmount").fill("550");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("100g");
  await page.locator("#productUnitAmount").fill("500");
  await context.route("**/api/seller/stores/*/products", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("통신할 수 없습니다");
  await expect(page.locator(".market-success")).toHaveCount(0);
  await expect(page.locator("#productUnitAmount")).toHaveValue("500");
  await context.unroute("**/api/seller/stores/*/products");
  await context.clearCookies();
  await page
    .getByRole("navigation", { name: "등록 상품 페이지" })
    .getByRole("button", { name: "새로고침" })
    .click();
  await expect(page.locator("#heading-login")).toBeVisible();
  await expect(page.locator("#heading-products")).toHaveCount(0);
  await expect(page.locator("#storeInfoName")).toHaveCount(0);
  await page.locator("#loginUserId").fill(required("E2E_SELLER_A_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-seller-store")).toBeVisible();
});
