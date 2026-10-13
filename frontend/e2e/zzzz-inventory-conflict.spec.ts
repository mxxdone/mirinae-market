import { test, expect } from "@playwright/test";
import { installTestClock } from "./fixedTime";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}을 설정해 주세요.`);
  return value;
}
test("작성 중 페이지 재조회가 오래된 재고 버전을 갱신하지 않음", async ({ browser }) => {
  const seller = await browser.newContext();
  const buyer = await browser.newContext();
  try {
    async function login(context: typeof seller, id: string) {
      let csrf = (await (await context.request.get("/api/auth/csrf")).json()) as {
        token: string;
        headerName: string;
      };
      expect(
        (
          await context.request.post("/api/auth/login", {
            headers: { [csrf.headerName]: csrf.token },
            form: { loginId: id, password: required("E2E_DEMO_PASSWORD") },
          })
        ).status(),
      ).toBe(200);
      csrf = (await (await context.request.get("/api/auth/csrf")).json()) as {
        token: string;
        headerName: string;
      };
      return { [csrf.headerName]: csrf.token };
    }
    const headers = await login(seller, "checkout_seller_a");
    const buyerHeaders = await login(buyer, required("E2E_BUYER_LOGIN_ID"));
    const store = (await (await seller.request.get("/api/seller/stores/me")).json()) as {
      id: number;
      marketId: number;
    };
    const date = required("E2E_FIXED_INSTANT").slice(0, 10);
    expect(
      (
        await seller.request.put(`/api/seller/stores/${store.id}/pickup-windows/${date}`, {
          headers,
          data: { startTime: "15:00", endTime: "19:00", orderDeadline: "14:00" },
        })
      ).status(),
    ).toBe(200);
    const prefix = `재고회귀-${Date.now()}`;
    let target = 0;
    let offer = 0;
    const existing = (await (
      await seller.request.get(`/api/seller/stores/${store.id}/products?size=1`)
    ).json()) as { totalItems: number };
    const fixtureCount = Math.max(1, 21 - existing.totalItems);
    await Promise.all(
      Array.from({ length: fixtureCount }, async (_, index) => {
        const product = await seller.request.post(`/api/seller/stores/${store.id}/products`, {
          headers,
          data: {
            name: `${prefix}-${String(index).padStart(2, "0")}`,
            description: "페이지 재조회 경쟁",
            unitType: "COUNT",
            unitAmount: 1,
          },
        });
        expect(product.status()).toBe(201);
        const id = ((await product.json()) as { id: number }).id;
        const response = await seller.request.put(
          `/api/seller/stores/${store.id}/products/${id}/offers/${date}`,
          { headers, data: { priceWon: 1000, onlineQuantity: 10 } },
        );
        expect(response.status()).toBe(200);
        if (index === 0) {
          target = id;
          offer = ((await response.json()) as { id: number }).id;
        }
      }),
    );
    const allProducts: { id: number }[] = [];
    for (let nextPage = 0; ; nextPage++) {
      const result = (await (
        await seller.request.get(
          `/api/seller/stores/${store.id}/products?size=100&page=${nextPage}`,
        )
      ).json()) as { items: { id: number }[]; hasNext: boolean };
      allProducts.push(...result.items);
      if (!result.hasNext) break;
    }
    const position = allProducts.findIndex((item) => item.id === target);
    expect(position).toBeGreaterThanOrEqual(0);
    const targetPage = Math.floor(position / 20);
    const sellerPage = await seller.newPage();
    await installTestClock(sellerPage);
    await sellerPage.goto("/");
    await expect(sellerPage.getByRole("button", { name: "상품 추가", exact: true })).toBeVisible();
    const pagination = sellerPage.getByRole("navigation", { name: "등록 상품 페이지" });
    if (targetPage > 0)
      await pagination
        .getByRole("button", { name: `${targetPage + 1}페이지`, exact: true })
        .click();
    const row = sellerPage.locator(`.sale-table-row[data-product-id="${target}"]`);
    await row.getByRole("textbox").nth(0).fill("1100");
    const cart = await buyer.request.put(`/api/buyer/cart/items/${offer}`, {
      headers: buyerHeaders,
      data: { marketId: store.marketId, quantity: 2 },
    });
    expect(cart.status()).toBe(200);
    const version = ((await cart.json()) as { version: number }).version;
    const paid = await buyer.request.post("/api/buyer/checkouts", {
      headers: buyerHeaders,
      data: { requestKey: `draft-${Date.now()}`, cartVersion: version, mode: "SUCCESS" },
    });
    expect(((await paid.json()) as { status: string }).status).toBe("CONFIRMED");
    const anotherPage = targetPage === 0 ? 2 : 1;
    await pagination.getByRole("button", { name: `${anotherPage}페이지`, exact: true }).click();
    await pagination.getByRole("button", { name: `${targetPage + 1}페이지`, exact: true }).click();
    await expect(row.getByRole("textbox").nth(0)).toHaveValue("1100");
    await sellerPage.getByRole("button", { name: "변경 사항 적용", exact: true }).click();
    await expect(sellerPage.getByText(/재고가 변경되었습니다/)).toBeVisible();
    const result = (await (
      await seller.request.get(`/api/markets/${store.marketId}/offers/${offer}`)
    ).json()) as { onlineQuantity: number; priceWon: number };
    expect(result.onlineQuantity).toBe(8);
    expect(result.priceWon).toBe(1000);
    await expect(row.getByRole("textbox").nth(0)).toHaveValue("1100");
    await sellerPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await sellerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await sellerPage.close();
  } finally {
    await seller.close();
    await buyer.close();
  }
});
