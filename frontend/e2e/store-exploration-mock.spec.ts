import { expect, test, type Page } from "@playwright/test";
import type { OfferView, LocatedMarketView } from "../src/api/types";

// 모든 API 응답을 대체하는 UI 회귀다. 실제 서버·DB E2E와 구분한다.
async function mockMarket(page: Page) {
  const calls = { regions: 0, markets: 0, offers: 0, stores: 0 };
  const market: LocatedMarketView = {
    id: 1,
    name: "통인시장",
    regionCode: null,
    provinceCode: null,
    regionLabel: null,
    address: null,
    latitude: null,
    longitude: null,
    distanceKm: null,
  };
  const offer = (index: number): OfferView => ({
    id: 100 + index,
    productId: index,
    marketId: 1,
    storeId: 10,
    storeName: "효자동 청과",
    productName: "사과 " + index,
    description: "판매 상품",
    unitType: "COUNT",
    unitAmount: 5,
    pickupDate: "2026-10-13",
    priceWon: 5000,
    onlineQuantity: 10,
    inventoryVersion: 0,
    startTime: "14:00:00",
    endTime: "18:00:00",
    orderDeadline: "13:00:00",
    comparisonUnit: "1개",
    comparisonPriceWon: 1000,
  });
  const store = { id: 10, marketId: 1, name: "효자동 청과" };
  await page.clock.install({ time: new Date("2026-10-13T03:00:00Z") });
  await page.route("**/actuator/health", (route) => route.fulfill({ json: { status: "UP" } }));
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname;
      const current = Number(url.searchParams.get("page") ?? 0);
      let body: unknown;
      if (path === "/api/auth/me")
        body = {
          id: 1,
          loginId: "test_buyer",
          displayName: "구매자",
          role: "BUYER",
          requiresPasswordChange: false,
        };
      else if (path.endsWith("/product-images")) body = [];
      else if (path === "/api/auth/csrf") body = { token: "test-csrf", headerName: "X-CSRF-TOKEN" };
      else if (path === "/api/market-regions") {
        calls.regions++;
        body = [];
      } else if (path === "/api/markets") {
        calls.markets++;
        body = [market, { ...market, id: 2, name: "둘째시장" }];
      } else if (path === "/api/markets/2/offers") {
        body = { items: [], page: 0, size: 20, hasNext: false, totalItems: 0 };
      } else if (path === "/api/markets/2/stores") {
        body = {
          items: [{ id: 20, marketId: 2, name: "둘째매장" }],
          page: 0,
          size: 20,
          hasNext: false,
          totalItems: 1,
        };
      } else if (path === "/api/markets/2/review-summaries") {
        body = [{ storeId: 20, averageRating: null, reviewCount: 0 }];
      } else if (path === "/api/markets/1/stores") {
        calls.stores++;
        body = { items: [store], page: current, size: 20, hasNext: false, totalItems: 1 };
      } else if (path === "/api/markets/1/stores/10") body = store;
      else if (path === "/api/markets/1/offers" || path === "/api/markets/1/stores/10/offers") {
        if (path === "/api/markets/1/offers") calls.offers++;
        body = {
          items:
            current === 0
              ? Array.from({ length: 20 }, (_, index) => offer(index + 1))
              : [offer(21)],
          page: current,
          size: 20,
          hasNext: current === 0,
          totalItems: 21,
        };
      } else if (path.startsWith("/api/markets/1/offers/"))
        body = offer(Number(path.split("/").at(-1)) - 100);
      else if (path === "/api/markets/1/review-summaries")
        body = [{ storeId: 10, averageRating: null, reviewCount: 0 }];
      else if (path === "/api/markets/1/stores/10/reviews")
        body = {
          items: [],
          page: 0,
          size: 20,
          hasNext: false,
          totalItems: 0,
          summary: { storeId: 10, averageRating: null, reviewCount: 0 },
        };
      else {
        await route.fulfill({ status: 404, json: { code: "NOT_FOUND", message: "모킹 범위 밖" } });
        return;
      }
      await route.fulfill({ status: 200, json: body });
    },
  );
  return calls;
}

test("시장 상품은 카드형·목록형 모두 상세 방문 없이 담고 장바구니로 이동한다", async ({ page }) => {
  await mockMarket(page);
  await page.route("**/api/buyer/cart**", (route) =>
    route.fulfill({ json: { version: 1, items: [] } }),
  );
  for (const view of ["카드형", "리스트형"]) {
    await page.goto("/#market?market=1");
    await expect(page.locator(".offer-card")).toHaveCount(20);
    await page.getByRole("button", { name: view, exact: true }).click();
    const request = page.waitForRequest(
      (value) => value.method() === "PUT" && value.url().endsWith("/api/buyer/cart/items/101"),
    );
    await page
      .locator(".offer-card")
      .first()
      .getByRole("button", { name: "장바구니 담기" })
      .click();
    expect((await request).postDataJSON()).toEqual({ marketId: 1, quantity: 1 });
    await expect(page).toHaveURL(/#cart$/);
    await expect(page.getByRole("heading", { name: "장바구니", exact: true })).toBeVisible();
  }
});

test("검색·탭 전환이 초기 시장·지역 조회를 반복하지 않는다", async ({ page }) => {
  const calls = await mockMarket(page);
  await page.goto("/#market?market=1");
  await expect(page.locator(".offer-card")).toHaveCount(20);
  await page.waitForLoadState("networkidle");
  const initial = { ...calls };
  expect(initial.markets).toBeGreaterThan(0);
  await page.locator("#productSearch").fill("사과");
  expect(calls.offers).toBe(initial.offers);
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await page.waitForLoadState("networkidle");
  expect(calls.offers).toBe(initial.offers + 1);
  await page.locator("#tabMarketStores").click();
  await expect(page.locator(".store-card")).toHaveCount(1);
  const storesBefore = calls.stores;
  await page.locator("#storeSearch").fill("효자동");
  expect(calls.stores).toBe(storesBefore);
  await page.locator("#btnSearchStore").click();
  await page.waitForLoadState("networkidle");
  expect(calls.stores).toBe(storesBefore + 1);
  expect(calls.markets).toBe(initial.markets);
  expect(calls.regions).toBe(initial.regions);
});

test("매장 상품 2페이지에서 상세·뒤로가기·새로고침 문맥을 복원한다", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/#market?market=1&tab=stores&store=10");
  await expect(page.locator("#heading-store-page")).toHaveText("효자동 청과");
  await page.getByRole("button", { name: "2페이지", exact: true }).click();
  await expect(page.getByRole("heading", { name: "사과 21", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/storeOfferPage=1/);
  await page.getByRole("button", { name: "사과 21", exact: true }).click();
  await expect(page).toHaveURL(/offer=121/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "사과 21", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator("#heading-store-page")).toHaveText("효자동 청과");
  await expect(page.getByRole("heading", { name: "사과 21", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#heading-store-page")).toHaveText("효자동 청과");
  await expect(page.getByRole("heading", { name: "사과 21", exact: true })).toBeVisible();
});

test("탭별 검색을 새로고침 후 복원하고 시장 변경 시 이전 매장을 버린다", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/#market?market=1");
  await expect(page.locator(".offer-card")).toHaveCount(20);
  await page.locator("#productSearch").fill("사과");
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await page.locator("#tabMarketStores").click();
  await page.locator("#storeSearch").fill("효자동");
  await page.locator("#btnSearchStore").click();
  await expect(page.locator(".store-card")).toHaveCount(1);
  await page.locator("#tabMarketOffers").click();
  await page.reload();
  await expect(page.locator("#productSearch")).toHaveValue("사과");
  await expect(page.locator(".offer-card")).toHaveCount(20);
  await page.locator("#tabMarketStores").click();
  await expect(page.locator("#storeSearch")).toHaveValue("효자동");
  await expect(page.locator(".store-card")).toHaveCount(1);
  await page.locator("#btnChangeBuyerMarket").click();
  await page.locator("#marketSelect").selectOption("2");
  await page.locator("#btnConfirmBuyerMarket").click();
  await page.locator("#tabMarketStores").click();
  await expect(page.locator("#storeSearch")).toHaveValue("");
  await expect(page.locator(".store-card")).toHaveCount(1);
  await expect(page.locator(".store-card")).toContainText("둘째매장");
});

test("캐시된 매장 탭으로 전환하면 늦은 상품 상세 응답을 무시한다", async ({ page }) => {
  await mockMarket(page);
  await page.goto("/#market?market=1");
  await expect(page.locator(".offer-card")).toHaveCount(20);
  await page.locator("#tabMarketStores").click();
  await expect(page.locator(".store-card")).toHaveCount(1);
  await page.locator("#tabMarketOffers").click();
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/markets/1/offers/101", async (route) => {
    arrived();
    await pending;
    await route.fallback();
  });
  try {
    await page.getByRole("button", { name: "사과 1", exact: true }).click();
    await started;
    await page.locator("#tabMarketStores").click();
    await expect(page.locator(".store-card")).toHaveCount(1);
    release();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".store-card")).toHaveCount(1);
    await expect(page.locator(".offer-detail")).toHaveCount(0);
  } finally {
    release();
  }
});

test("상품 보기 전환은 재조회 없이 같은 상품을 배치하고 매장·모바일에서도 유지한다", async ({
  page,
}) => {
  const calls = await mockMarket(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/#market?market=1");
  await expect(page.locator(".offer-card")).toHaveCount(20);
  const list = page.getByRole("button", { name: "리스트형", exact: true });
  const grid = page.getByRole("button", { name: "카드형", exact: true });
  await expect(list).toHaveAttribute("title", "리스트형 보기");
  await expect(grid).toHaveAttribute("title", "카드형 보기");
  await expect(list.locator("svg[aria-hidden='true']")).toHaveCount(1);
  await expect(grid.locator("svg[aria-hidden='true']")).toHaveCount(1);
  await expect(list).toHaveText("");
  await expect(grid).toHaveText("");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveAttribute("aria-pressed", "false");
  await page.waitForLoadState("networkidle");
  const initial = { ...calls };
  const names = await page.locator(".offer-card h3").allTextContents();
  await list.click();
  await page.screenshot({ path: "../.local/verification/offer-list-pc.png" });
  await grid.focus();
  await page.keyboard.press("Space");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(list).toHaveAttribute("aria-pressed", "false");
  expect(await page.locator(".offer-card h3").allTextContents()).toEqual(names);
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual(initial);
  await page.screenshot({ path: "../.local/verification/offer-grid-pc.png" });
  for (const [width, columns] of [
    [320, 1],
    [390, 1],
    [768, 2],
    [1024, 3],
    [1280, 4],
    [2560, 4],
  ]) {
    await page.setViewportSize({ width: width!, height: 1000 });
    const edges = await page
      .locator(
        ".market-nav-tabs, #panelMarketOffers > .market-search-bar, .offer-view-controls, .offer-grid",
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, width: box.width };
        }),
      );
    expect(edges).toHaveLength(4);
    for (const edge of edges) {
      expect(Math.abs(edge.x - edges[0]!.x)).toBeLessThan(2);
      expect(Math.abs(edge.width - edges[0]!.width)).toBeLessThan(2);
    }
    expect(
      await page
        .locator(".offer-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    ).toBe(columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "효자동 청과", exact: true }).first().click();
  await expect(page.locator("#heading-store-page")).toHaveText("효자동 청과");
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "장바구니 담기", exact: true })).toHaveCount(20);
  expect(
    await page
      .locator(".buyer-store-page")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(900);
  await list.click();
  await expect(page.locator(".offer-grid")).toHaveAttribute("data-view", "list");
  const assertListLayout = async () => {
    const card = page.locator(".offer-card").first();
    const photo = (await card.locator(".offer-photo-button").boundingBox())!;
    const info = (await card.locator(".offer-card-info").boundingBox())!;
    expect(info.x).toBeGreaterThanOrEqual(photo.x + photo.width);
    expect(Math.abs(info.y - photo.y)).toBeLessThan(2);
  };
  await assertListLayout();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertListLayout();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../.local/verification/offer-list-store-mobile.png" });
  await page.getByRole("button", { name: "2페이지", exact: true }).click();
  await expect(page.getByRole("heading", { name: "사과 21", exact: true })).toBeVisible();
  await expect(list).toHaveAttribute("aria-pressed", "true");
});

test("상품 상세는 PC에서 사진과 정보를 나란히 두고 기본 그림은 여백 안에 작게 표시한다", async ({
  page,
}) => {
  await mockMarket(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#market?market=1");
  const placeholder = page.locator(".offer-card .product-photo--placeholder").first();
  const cardArea = await placeholder.boundingBox();
  const cardImage = await placeholder.locator("img").boundingBox();
  expect(cardImage!.width).toBeLessThan(cardArea!.width / 2);
  await page.getByRole("button", { name: "사과 1", exact: true }).click();
  const photo = page.locator(".product-detail-media .product-photo");
  const info = page.locator(".product-detail-info");
  await expect(info).toBeVisible();
  const photoBox = (await photo.boundingBox())!;
  const infoBox = (await info.boundingBox())!;
  expect(photoBox.width).toBeLessThanOrEqual(420);
  expect(infoBox.x).toBeGreaterThanOrEqual(photoBox.x + photoBox.width);
  expect(Math.abs(photoBox.y - infoBox.y)).toBeLessThan(2);
  const image = (await photo.locator("img").boundingBox())!;
  expect(image.width).toBeLessThanOrEqual(120);
  expect(image.width).toBeLessThan(photoBox.width / 2);
  await page.screenshot({ path: "../.local/verification/product-detail-columns-pc.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePhoto = (await photo.boundingBox())!;
  const mobileInfo = (await info.boundingBox())!;
  expect(mobilePhoto.width).toBeLessThanOrEqual(320);
  expect(mobileInfo.y).toBeGreaterThanOrEqual(mobilePhoto.y + mobilePhoto.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../.local/verification/product-detail-columns-mobile.png" });
  await page.getByRole("button", { name: "← 상품 목록으로", exact: true }).click();
  await expect(page.getByRole("button", { name: /^상품 상세 보기/ })).toHaveCount(0);
  const photoButton = page.getByRole("button", {
    name: "사과 1 사진으로 상세 보기",
    exact: true,
  });
  await photoButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".product-detail-info h2")).toHaveText("사과 1");
  await page.getByRole("button", { name: "← 상품 목록으로", exact: true }).click();
  await page.getByRole("button", { name: "카드형", exact: true }).click();
  await page.getByRole("button", { name: "사과 1", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".product-detail-info h2")).toHaveText("사과 1");
});
