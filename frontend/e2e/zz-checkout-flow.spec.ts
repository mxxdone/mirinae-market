import { chooseBuyerMarket } from "./buyerMarket";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { installTestClock } from "./fixedTime";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}을 설정해 주세요.`);
  return value;
}
async function signed(context: BrowserContext, loginId: string) {
  let csrf = (await (await context.request.get("/api/auth/csrf")).json()) as {
    token: string;
    headerName: string;
  };
  expect(
    (
      await context.request.post("/api/auth/login", {
        headers: { [csrf.headerName]: csrf.token },
        form: { loginId, password: required("E2E_DEMO_PASSWORD") },
      })
    ).status(),
  ).toBe(200);
  csrf = (await (await context.request.get("/api/auth/csrf")).json()) as {
    token: string;
    headerName: string;
  };
  return { [csrf.headerName]: csrf.token };
}
async function publish(context: BrowserContext, loginId: string, name: string) {
  const headers = await signed(context, loginId);
  const store = (await (await context.request.get("/api/seller/stores/me")).json()) as {
    id: number;
    marketId: number;
  };
  const date = required("E2E_FIXED_INSTANT").slice(0, 10);
  expect(
    (
      await context.request.put(`/api/seller/stores/${store.id}/pickup-windows/${date}`, {
        headers,
        data: { startTime: "15:00", endTime: "19:00", orderDeadline: "14:00" },
      })
    ).status(),
  ).toBe(200);
  const product = await context.request.post(`/api/seller/stores/${store.id}/products`, {
    headers,
    data: { name, description: "결제 흐름 검증", unitType: "COUNT", unitAmount: 12 },
  });
  expect(product.status()).toBe(201);
  const id = ((await product.json()) as { id: number }).id;
  const response = await context.request.put(
    `/api/seller/stores/${store.id}/products/${id}/offers/${date}`,
    { headers, data: { priceWon: 1000, onlineQuantity: 10 } },
  );
  expect(response.status()).toBe(200);
  const offer = (await response.json()) as { id: number };
  return { ...store, offerId: offer.id, productId: id, headers };
}
async function loginBuyer(page: Page) {
  await installTestClock(page);
  await page.goto("/");
  await page.locator("#loginUserId").fill(required("E2E_BUYER_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-market")).toBeVisible();
}
async function addFromScreen(page: Page, market: number, name: string) {
  await chooseBuyerMarket(page, String(market));
  await page.locator("#productSearch").fill(name);
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await page
    .locator(".offer-card")
    .first()
    .getByRole("button", { name: /상품 상세 보기/ })
    .click();
  await page.getByRole("button", { name: "장바구니 담기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "장바구니", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#cart$/);
  await expect(page.locator(".checkout-order")).toHaveCount(0);
}
test("두 매장 통합 결제·응답 유실 결과 확인·새로고침 주문 복원", async ({ page, browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const prefix = `통합결제-${Date.now()}`;
    const a = await publish(first, "checkout_seller_a", prefix + "사과");
    const b = await publish(second, "checkout_seller_b", prefix + "배");
    expect(a.marketId).toBe(b.marketId);
    await loginBuyer(page);
    await addFromScreen(page, a.marketId, prefix + "사과");
    await page.reload();
    await expect(page.getByRole("heading", { name: "장바구니", exact: true })).toBeVisible();
    await expect(page.locator(`[id="cart-quantity-${a.offerId}"]`)).toHaveValue("1");
    await page.getByRole("button", { name: "장바구니 비우기", exact: true }).click();
    await expect(page.getByText("장바구니가 비어 있습니다.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "← 시장 상품으로" }).click();
    await addFromScreen(page, a.marketId, prefix + "사과");
    await page.locator(`[id="cart-quantity-${a.offerId}"]`).fill("2");
    await page.getByRole("button", { name: "수량 적용", exact: true }).click();
    await page.getByRole("button", { name: "← 시장 상품으로" }).click();
    await addFromScreen(page, b.marketId, prefix + "배");
    await page.locator("#payment-mode").selectOption("LOST_RESPONSE");
    await page.getByRole("button", { name: "통합 모의 결제", exact: true }).click();
    await expect(page.getByRole("button", { name: "결제 결과 확인", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "결제 결과 확인", exact: true }).click();
    await expect(page.getByText(/결제가 완료되었습니다/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#orders$/);
    await expect(page.locator("#payment-mode")).toHaveCount(0);
    await expect(page.locator(".checkout-item")).toHaveCount(0);
    const order = page.locator(".checkout-order").filter({ hasText: prefix });
    await expect(order).toContainText("3,000원");
    await expect(order).toContainText("결제검증 첫매장");
    await expect(order).toContainText("결제검증 둘째매장");
    await page.reload();
    await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
    await expect(page.locator(".checkout-order").filter({ hasText: prefix })).toHaveCount(1);
    await page.getByRole("button", { name: "장바구니", exact: true }).click();
    await expect(page.getByRole("heading", { name: "장바구니", exact: true })).toBeVisible();
    await expect(page.getByText("장바구니가 비어 있습니다.", { exact: false })).toBeVisible();
    await expect(page.locator(".checkout-order")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
    await expect(page.locator(".checkout-order").filter({ hasText: prefix })).toHaveCount(1);
    await page.screenshot({
      path: "../output/playwright/phase4-checkout-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: "../output/playwright/phase4-checkout-mobile.png",
      fullPage: true,
    });
  } finally {
    await first.close();
    await second.close();
  }
});
test("모의 결제 실패와 가격 변경 재확인은 재고를 차감하지 않고 성공 안내도 하지 않음", async ({
  page,
  browser,
}) => {
  const seller = await browser.newContext();
  try {
    const name = `재확인-${Date.now()}`;
    const item = await publish(seller, "checkout_seller_a", name);
    await loginBuyer(page);
    await addFromScreen(page, item.marketId, name);
    await page.locator("#payment-mode").selectOption("FAIL");
    await page.getByRole("button", { name: "통합 모의 결제", exact: true }).click();
    await expect(page.getByText(/결제 실패: 모의 결제가 실패/)).toBeVisible();
    await expect(page).toHaveURL(/#cart$/);
    await expect(page.locator(".checkout-order")).toHaveCount(0);
    expect(
      (
        (await (
          await seller.request.get(`/api/markets/${item.marketId}/offers/${item.offerId}`)
        ).json()) as { onlineQuantity: number }
      ).onlineQuantity,
    ).toBe(10);
    expect(
      (
        await seller.request.put(
          `/api/seller/stores/${item.id}/products/${item.productId}/offers/${required("E2E_FIXED_INSTANT").slice(0, 10)}`,
          {
            headers: item.headers,
            data: { priceWon: 1500, onlineQuantity: 10, inventoryVersion: 0 },
          },
        )
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "장바구니 새로고침", exact: true }).click();
    await expect(page.getByRole("button", { name: "통합 모의 결제", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "변경 조건 확인·수량 적용", exact: true }).click();
    await page.locator("#payment-mode").selectOption("SUCCESS");
    await page.getByRole("button", { name: "통합 모의 결제", exact: true }).click();
    await expect(page.getByText(/결제가 완료되었습니다/)).toBeVisible();
    await expect(page.locator(".checkout-order").filter({ hasText: name })).toContainText(
      "1,500원",
    );
  } finally {
    await seller.close();
  }
});

test("시장과 계정 메뉴에서 장바구니·주문 내역에 독립적으로 접근하고 뒤로가기로 복원", async ({
  page,
}) => {
  await loginBuyer(page);
  await page.getByRole("button", { name: "주문 내역", exact: true }).click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  await expect(page.locator("#payment-mode")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("#heading-market")).toBeVisible();
  await page.getByRole("button", { name: "내 계정", exact: true }).click();
  await page.getByRole("button", { name: "장바구니", exact: true }).click();
  await expect(page.getByRole("heading", { name: "장바구니", exact: true })).toBeVisible();
  await expect(page.locator(".checkout-order")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("#heading-buyer-summary")).toBeVisible();
  await page.getByRole("button", { name: "주문 내역", exact: true }).click();
  await expect(page).toHaveURL(/#orders$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
});
