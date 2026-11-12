import { expect, test, type Page } from "@playwright/test";
import type { OfferView } from "../src/api/types";
import type { Cart, Checkout, PaymentInput } from "../src/api/checkout";

// API를 대체한 UI 회귀이며 실제 서버·재고 검증과 구분한다.
async function setup(page: Page, empty = false) {
  const offer = (id: number, marketId = 1, storeId = 10): OfferView => ({
    id,
    productId: id,
    marketId,
    storeId,
    storeName: storeId === 10 ? "청과점" : "정육점",
    productName: ["", "사과", "딸기", "고기"][id]!,
    description: "판매 상품",
    unitType: "COUNT",
    unitAmount: 1,
    pickupDate: "2026-11-04",
    priceWon: id === 1 ? 1000 : id === 2 ? 2500 : 4000,
    onlineQuantity: 10,
    inventoryVersion: 0,
    startTime: "20:00:00",
    endTime: "22:00:00",
    orderDeadline: "19:00:00",
    comparisonUnit: "1개",
    comparisonPriceWon: id === 1 ? 1000 : id === 2 ? 2500 : 4000,
  });
  const offers = [offer(1), offer(2), offer(3, 2, 20)];
  let cart: Cart = {
    version: 1,
    items: empty
      ? []
      : offers.map((o) => ({
          offer: o,
          marketName: o.marketId === 1 ? "중앙시장" : "남부시장",
          quantity: o.id === 1 ? 2 : 1,
          expectedPrice: o.priceWon,
          available: true,
          changed: false,
        })),
  };
  const history: Checkout[] = [];
  const payments: PaymentInput[] = [];
  const additions: Array<{ marketId: number; quantity: number }> = [];
  const snapshot = () => ({
    ...cart,
    items: cart.items.map((i) => ({
      ...i,
      available: i.offer.onlineQuantity >= i.quantity && i.offer.onlineQuantity > 0,
    })),
  });
  await page.route("**/actuator/health", (r) => r.fulfill({ json: { status: "UP" } }));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method();
      let body: unknown = [];
      if (path === "/api/auth/me")
        body = {
          id: 1,
          loginId: "test_buyer",
          displayName: "구매자",
          role: "BUYER",
          requiresPasswordChange: false,
          hasLocalPassword: true,
        };
      else if (path === "/api/auth/refresh")
        body = { authenticated: true, accessToken: "mock-access-token", expiresIn: 600 };
      else if (path === "/api/auth/csrf") body = { token: "test-csrf", headerName: "X-CSRF-TOKEN" };
      else if (path === "/api/market-regions" || path.endsWith("/product-images")) body = [];
      else if (path === "/api/markets")
        body = [1, 2].map((id) => ({
          id,
          name: id === 1 ? "중앙시장" : "남부시장",
          regionCode: null,
          provinceCode: null,
          regionLabel: null,
          address: null,
          latitude: null,
          longitude: null,
          distanceKm: null,
        }));
      else if (path.endsWith("/review-summaries"))
        body = [{ storeId: 10, averageRating: null, reviewCount: 0 }];
      else if (path === "/api/buyer/cart" && method === "GET") body = snapshot();
      else if (path === "/api/buyer/cart" && method === "DELETE") {
        cart = { version: cart.version + 1, items: [] };
        await route.fulfill({ status: 204 });
        return;
      } else if (path.startsWith("/api/buyer/cart/items/")) {
        const id = Number(path.split("/").at(-1)),
          o = offers.find((item) => item.id === id)!;
        if (method === "DELETE") {
          cart = { version: cart.version + 1, items: cart.items.filter((i) => i.offer.id !== id) };
          await route.fulfill({ status: 204 });
          return;
        }
        const data = route.request().postDataJSON() as { marketId: number; quantity: number };
        if (method === "POST") additions.push(data);
        const existing = cart.items.find((i) => i.offer.id === id),
          quantity = method === "POST" ? (existing?.quantity ?? 0) + data.quantity : data.quantity;
        cart = {
          version: cart.version + 1,
          items: [
            ...cart.items.filter((i) => i.offer.id !== id),
            {
              offer: o,
              marketName: o.marketId === 1 ? "중앙시장" : "남부시장",
              quantity,
              expectedPrice: o.priceWon,
              available: true,
              changed: false,
            },
          ].sort((a, b) => a.offer.id - b.offer.id),
        };
        body = snapshot();
      } else if (path === "/api/buyer/orders") body = history;
      else if (path === "/api/buyer/checkouts" && method === "POST") {
        const input = route.request().postDataJSON() as PaymentInput;
        payments.push(input);
        const rows = input.directItem
          ? [
              {
                offer: offers.find((o) => o.id === input.directItem!.offerId)!,
                quantity: input.directItem.quantity,
              },
            ]
          : cart.items.filter((i) => input.offerIds?.includes(i.offer.id));
        const total = rows
          .reduce((sum, i) => sum + BigInt(i.offer.priceWon) * BigInt(i.quantity), 0n)
          .toString();
        const result: Checkout = {
          id: history.length + 1,
          requestKey: input.requestKey,
          status: "CONFIRMED",
          errorCode: null,
          message: null,
          totalWon: total,
          storeOrders: [],
        };
        history.unshift(result);
        if (!input.directItem)
          cart = {
            version: cart.version + 1,
            items: cart.items.filter((i) => !input.offerIds?.includes(i.offer.id)),
          };
        else cart = { ...cart, version: cart.version + 1 };
        if (input.mode === "LOST_RESPONSE") {
          await route.fulfill({
            status: 503,
            json: { code: "PAYMENT_RESPONSE_LOST", message: "응답을 받지 못했습니다." },
          });
          return;
        }
        body = result;
      } else if (path.startsWith("/api/buyer/checkouts/"))
        body = history.find((item) => item.requestKey === path.split("/").at(-1));
      else if (/\/offers\/\d+$/.test(path))
        body = offers.find((o) => o.id === Number(path.split("/").at(-1)));
      else if (path.endsWith("/offers")) {
        const market = Number(path.split("/")[3]),
          store = path.includes("/stores/") ? Number(path.split("/")[5]) : null;
        const items = offers.filter(
          (o) => o.marketId === market && (store === null || o.storeId === store),
        );
        body = { items, page: 0, size: 20, hasNext: false, totalItems: items.length };
      } else if (path.endsWith("/stores"))
        body = { items: [], page: 0, size: 20, hasNext: false, totalItems: 0 };
      else {
        await route.fulfill({
          status: 404,
          json: { code: "NOT_FOUND", message: "모의 응답 범위 밖" },
        });
        return;
      }
      await route.fulfill({ json: body });
    },
  );
  return { offers, payments, additions, getCart: snapshot };
}
function row(page: Page, name: string) {
  return page.locator(".checkout-item").filter({ hasText: name });
}

test("장바구니 비우기는 취소·Esc에서 보존하고 확인할 때만 전체 삭제한다", async ({ page }) => {
  const state = await setup(page);
  let clearRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === "/api/buyer/cart")
      clearRequests += 1;
  });
  await page.goto("/#cart");
  await expect(page.locator(".checkout-item")).toHaveCount(3);
  const clearButton = page.getByRole("button", { name: "장바구니 비우기", exact: true });
  const dialog = page.getByRole("dialog", { name: "장바구니를 비울까요?" });
  await clearButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(clearButton).toBeFocused();
  expect(clearRequests).toBe(0);
  expect(state.getCart().items).toHaveLength(3);
  await clearButton.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(clearRequests).toBe(0);
  await expect(page.locator(".checkout-item")).toHaveCount(3);
  await clearButton.click();
  await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(
    page.getByText("장바구니가 비어 있습니다. 시장 상품에서 담아 주세요."),
  ).toBeVisible();
  expect(clearRequests).toBe(1);
  expect(state.getCart().items).toHaveLength(0);
  await expect(clearButton).toBeDisabled();
});

test("상세 수량·금액·간소화된 다른 상품과 목록 누적 담기·종류 수를 유지한다", async ({ page }) => {
  const state = await setup(page, true);
  await page.goto("/#market?market=1&offer=1");
  await expect(page.locator(".product-detail-info h2")).toHaveText("사과");
  const others = page.getByRole("region", { name: "이 매장의 다른 상품" });
  await expect(others.locator(".offer-card")).toHaveCount(1);
  await expect(others.locator(".offer-pickup")).toHaveCount(0);
  await expect(others.getByRole("button", { name: "장바구니 담기" })).toHaveCount(0);
  await page.locator("#detail-quantity").fill("0");
  await expect(page.getByRole("button", { name: "바로 구매", exact: true })).toBeDisabled();
  await page.locator("#detail-quantity").fill("10");
  await expect(page.getByRole("button", { name: "구매 수량 늘리기", exact: true })).toBeDisabled();
  await page.locator("#detail-quantity").fill("3");
  await expect(page.locator(".detail-total")).toContainText("3,000");
  await page.getByRole("button", { name: "장바구니 담기", exact: true }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  expect(state.additions).toEqual([{ marketId: 1, quantity: 3 }]);
  await expect(page.locator(".product-detail-info h2")).toHaveText("사과");
  await page.getByRole("button", { name: "← 상품 목록으로", exact: true }).click();
  await page.locator(".offer-card").first().getByRole("button", { name: "장바구니 담기" }).click();
  await expect.poll(() => state.getCart().items[0]?.quantity).toBe(4);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.locator(".offer-card").nth(1).getByRole("button", { name: "장바구니 담기" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("2");
  await expect(page).not.toHaveURL(/#cart$/);
});

test("시장·매장별 선택과 수량 합계·확인 취소·선택 결제로 미선택 상품을 보존한다", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/#cart");
  await expect(page.locator(".checkout-item")).toHaveCount(3);
  await expect(row(page, "사과").getByRole("checkbox")).toBeChecked();
  await expect(row(page, "딸기").getByRole("checkbox")).toBeChecked();
  await expect(row(page, "고기").getByRole("checkbox")).toBeChecked();
  await expect(page.getByRole("heading", { name: "중앙시장", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "남부시장", exact: true })).toBeVisible();
  await row(page, "딸기").getByRole("checkbox").uncheck();
  await row(page, "딸기").locator('input[inputmode="numeric"]').fill("");
  await row(page, "사과").locator('input[inputmode="numeric"]').fill("3");
  const pay = page.getByRole("button", { name: "통합 모의 결제", exact: true });
  await expect(pay).toBeDisabled();
  await row(page, "사과").getByRole("button", { name: "수량 적용", exact: true }).click();
  await expect(pay).toBeEnabled();
  await expect(page.locator(".checkout-payment")).toContainText("7,000");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await pay.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2개 시장");
  await expect(dialog).not.toContainText("중앙시장");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(state.payments).toHaveLength(0);
  await pay.click();
  await dialog.getByRole("button", { name: "돌아가기" }).click();
  expect(state.payments).toHaveLength(0);
  await pay.click();
  await dialog.getByRole("button", { name: "결제 계속하기" }).click();
  await expect(page.locator("#orders-heading")).toBeVisible();
  expect(state.payments).toHaveLength(1);
  expect(state.payments[0]?.offerIds).toEqual([1, 3]);
  expect(state.getCart().items.map((i) => i.offer.id)).toEqual([2]);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
});

test("바로 구매의 수량 새로고침·응답 유실 확인은 기존 장바구니를 보존한다", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/#buy?market=1&offer=1&quantity=2");
  await expect(page.locator("#checkout-heading")).toHaveText("주문 확인");
  await page.locator("#direct-quantity").fill("3");
  await expect(page).toHaveURL(/quantity=3/);
  await page.reload();
  await expect(page.locator("#direct-quantity")).toHaveValue("3");
  await page.locator("#payment-mode").selectOption("LOST_RESPONSE");
  await page.getByRole("button", { name: "통합 모의 결제" }).click();
  await page.getByRole("button", { name: "결제 결과 확인", exact: true }).click();
  await expect(page.locator("#orders-heading")).toBeVisible();
  expect(state.payments).toHaveLength(1);
  expect(state.payments[0]?.offerIds).toBeUndefined();
  expect(state.payments[0]?.directItem).toMatchObject({
    offerId: 1,
    quantity: 3,
    expectedPrice: 1000,
  });
  expect(state.getCart().items.map((i) => [i.offer.id, i.quantity])).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);
  await expect(page.getByTestId("cart-count")).toHaveText("3");
});

test("재고 부족 상품은 제외하고 수량을 줄여 적용하면 다시 선택할 수 있다", async ({ page }) => {
  const state = await setup(page);
  state.offers[0]!.onlineQuantity = 1;
  state.offers[1]!.onlineQuantity = 0;
  await page.goto("/#cart");
  await expect(row(page, "사과")).toContainText("잔여 수량이 부족");
  await expect(row(page, "사과").getByRole("checkbox")).toBeDisabled();
  await expect(row(page, "딸기")).toContainText("품절");
  await row(page, "고기").getByRole("checkbox").uncheck();
  await row(page, "사과").locator('input[inputmode="numeric"]').fill("1");
  await row(page, "사과").getByRole("button", { name: "수량 적용", exact: true }).click();
  await expect(row(page, "사과").getByRole("checkbox")).toBeEnabled();
  await row(page, "사과").getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "통합 모의 결제" })).toBeEnabled();
  await page.getByRole("button", { name: "장바구니 새로고침" }).click();
  await expect(row(page, "사과").getByRole("checkbox")).toBeChecked();
  await expect(row(page, "고기").getByRole("checkbox")).not.toBeChecked();
});
