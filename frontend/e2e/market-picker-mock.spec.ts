import { expect, test } from "@playwright/test";
import type { MapSdkProvider } from "../src/api/mapSdk";
import type { MapBounds } from "../src/api/types";

// API와 지도 SDK를 대체한 UI 회귀이며 실제 서버 검증과 구분한다.
test.beforeEach(async ({ page }) => {
  const names = [
    "하늘시장",
    "파란시장",
    "타래시장",
    "카누시장",
    "차림시장",
    "자람시장",
    "아침시장",
    "사랑시장",
    "바다시장",
    "마루시장",
    "라온시장",
    "다온시장",
    "나래시장",
    "가람시장",
  ];
  await page.route("https://oapi.map.naver.com/**", (route) => route.abort());
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const url = new URL(route.request().url());
      let body: unknown = [];
      if (url.pathname === "/api/auth/me")
        body = {
          id: 1,
          loginId: "test_buyer",
          displayName: "구매자",
          role: "BUYER",
          requiresPasswordChange: false,
        };
      else if (url.pathname === "/api/buyer/cart") body = { version: 0, items: [] };
      else if (url.pathname === "/api/markets")
        body = names
          .map((name, i) => ({
            id: i + 1,
            name,
            provinceCode: "11",
            regionCode: "11110",
            regionLabel: "서울특별시 종로구",
            address: "테스트 주소",
            latitude: 37.57,
            longitude: 127,
            distanceKm: url.searchParams.has("latitude") ? i + 1 : null,
          }))
          .filter((m) => m.name.includes(url.searchParams.get("query") ?? ""));
      else if (url.pathname.endsWith("/offers") || url.pathname.endsWith("/stores"))
        body = { items: [], page: 0, size: 20, totalItems: 0, hasNext: false };
      return route.fulfill({ json: body });
    },
  );
});

test("가나다순 10개씩 페이지를 제공하고 검색 시 첫 페이지로 복귀하며 행 클릭으로 바로 진입한다", async ({
  page,
}) => {
  await page.goto("/");
  const rows = page.locator("#marketResults button");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("가람시장");
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.locator("#btnConfirmBuyerMarket")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "시장 검색 결과 페이지" })
    .getByRole("button", { name: "다음 페이지" })
    .click();
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("카누시장");
  await page.locator("#buyerInputMarketName").fill("하늘");
  await page.locator("#btnSearchMarketName").click();
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(page.locator("#productSearch")).toBeVisible();
  await expect(page.locator(".buyer-current-market")).toContainText("하늘시장");
  await page.reload();
  await expect(page.locator("#productSearch")).toBeVisible();
});

test("지역 선택과 시장명 입력은 결과를 유지하고 검색·Enter로만 조건을 적용한다", async ({
  page,
}) => {
  await page.route("**/api/market-regions", (route) =>
    route.fulfill({
      json: [
        {
          code: "11110",
          provinceCode: "11",
          provinceName: "서울특별시",
          provinceShortName: "서울",
          districtName: "종로구",
        },
        {
          code: "26110",
          provinceCode: "26",
          provinceName: "부산광역시",
          provinceShortName: "부산",
          districtName: "중구",
        },
      ],
    }),
  );
  const searches: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/markets") searches.push(url);
  });
  await page.goto("/");
  const rows = page.locator("#marketResults button");
  await expect(rows).toHaveCount(10);
  await page.waitForLoadState("networkidle");
  const initial = searches.length;
  await page.locator("#buyerSelectProvince").selectOption("11");
  await page.locator("#buyerSelectDistrict").selectOption("11110");
  await expect(rows).toHaveCount(10);
  await page.waitForLoadState("networkidle");
  expect(searches).toHaveLength(initial);
  await page.locator("#btnSearchMarketName").click();
  await page.waitForLoadState("networkidle");
  expect(searches).toHaveLength(initial + 1);
  expect(Object.fromEntries(searches.at(-1)!.searchParams)).toEqual({
    provinceCode: "11",
    regionCode: "11110",
  });
  await page.locator("#buyerInputMarketName").fill("하늘");
  expect(searches).toHaveLength(initial + 1);
  await page.locator("#buyerInputMarketName").press("Enter");
  await expect(rows).toHaveCount(1);
  expect(Object.fromEntries(searches.at(-1)!.searchParams)).toEqual({
    provinceCode: "11",
    regionCode: "11110",
    query: "하늘",
  });
  await page.locator("#buyerSelectProvince").selectOption("26");
  await expect(page.locator("#buyerSelectDistrict")).toHaveValue("");
  await expect(page.locator("#buyerSelectDistrict option")).toHaveText(["전체 시군구", "중구"]);
  await expect(rows).toHaveCount(1);
  expect(searches).toHaveLength(initial + 2);
});

test("시장 검색 실패 뒤 입력을 바꿔도 재시도는 마지막 제출 조건을 사용한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  let fail = true;
  await page.route("**/api/markets?**", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { message: "검색 실패" } });
    } else await route.fallback();
  });
  await page.locator("#buyerInputMarketName").fill("하늘");
  await page.locator("#btnSearchMarketName").click();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
  await page.locator("#buyerInputMarketName").fill("바다");
  const retried = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/markets",
  );
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  expect(new URL((await retried).url()).searchParams.get("query")).toBe("하늘");
  await expect(page.locator("#marketResults button")).toContainText(["하늘시장"]);
  await expect(page.locator("#buyerInputMarketName")).toHaveValue("바다");
});

test("지도는 4대3이며 마커의 시장 정보를 확인한 뒤 상품 보기로 진입한다", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await ready;
    await route.fulfill({
      json: {
        id: 1,
        loginId: "test_buyer",
        displayName: "구매자",
        role: "BUYER",
        requiresPasswordChange: false,
      },
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const modulePath =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => new URL(url).pathname === "/src/api/mapSdk.ts")
        .at(-1) ?? "/src/api/mapSdk.ts";
    const sdk = (await import(modulePath)) as typeof import("../src/api/mapSdk");
    const provider: MapSdkProvider = {
      loadSdk: () => Promise.resolve(),
      geocode: () => Promise.reject(new Error("미사용")),
      reverseGeocode: () => Promise.reject(new Error("미사용")),
      mountAdminPicker: () => {
        throw new Error("미사용");
      },
      mountBuyerOverview: (container, options) => {
        container.dataset.marketIds = options.markets.map((market) => market.id).join(",");
        const button = document.createElement("button");
        button.textContent = "테스트 마커";
        button.onclick = () => options.onSelectMarket(14);
        container.append(button);
        return { update: () => {}, destroy: () => container.replaceChildren() };
      },
    };
    sdk.setMapSdkProvider(provider);
  });
  release();
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  await expect(page.locator("#btnToggleBuyerMap")).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await page.locator("#buyerOverviewMap").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width / box!.height).toBeCloseTo(4 / 3, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const map = page.locator("#buyerOverviewMap");
  await expect(map).toHaveAttribute("data-market-ids", "14,13,12,11,10,9,8,7,6,5");
  const pages = page.getByRole("navigation", { name: "시장 검색 결과 페이지" });
  await pages.getByRole("button", { name: "다음 페이지" }).click();
  await expect(map).toHaveAttribute("data-market-ids", "4,3,2,1");
  await pages.getByRole("button", { name: "이전 페이지" }).click();
  await expect(map).toHaveAttribute("data-market-ids", "14,13,12,11,10,9,8,7,6,5");
  await page.getByRole("button", { name: "테스트 마커", exact: true }).click();
  const preview = page.getByRole("region", { name: "지도에서 고른 시장" });
  await expect(preview).toContainText("가람시장");
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.evaluate(() => scrollTo(0, 0));
  const desktopMap = await page.locator(".buyer-map-frame").boundingBox();
  expect(desktopMap!.y).toBeLessThan(800 / 3);
  await expect(preview).toBeInViewport({ ratio: 1 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const frame = await page.locator(".buyer-map-frame").boundingBox();
    const card = await preview.boundingBox();
    expect(card!.x).toBeGreaterThanOrEqual(frame!.x);
    expect(card!.x + card!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
    expect(card!.y).toBeGreaterThanOrEqual(frame!.y);
    expect(card!.y + card!.height).toBeLessThanOrEqual(frame!.y + frame!.height);
  }
  await expect(page.locator("#productSearch")).toBeHidden();
  await preview.getByRole("button", { name: "상품 보기", exact: true }).click();
  await expect(page.locator("#productSearch")).toBeVisible();
  await expect(page.locator(".buyer-current-market")).toContainText("가람시장");
});

test("빈 결과 안내는 지도 아래가 아닌 시장 검색 목록 영역에 표시한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  await page.locator("#buyerInputMarketName").fill("존재하지않는시장");
  await page.locator("#btnSearchMarketName").click();
  await expect(page.locator("#marketResults button")).toHaveCount(0);
  await expect(page.locator(".buyer-market-results #buyerMarketEmpty")).toBeVisible();
  await expect(page.locator("#buyerMarketEmpty")).toHaveCount(1);
  await expect(page.locator(".buyer-market-map-pane #buyerMarketEmpty")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "시장 검색 결과 페이지" })).toHaveCount(0);
  await page.locator("#buyerInputMarketName").fill("가람");
  await page.locator("#btnSearchMarketName").click();
  await expect(page.locator("#marketResults button")).toHaveCount(1);
  await expect(page.locator("#buyerMarketEmpty")).toHaveCount(0);
});

test("내 주변 시장은 가나다순보다 거리순을 우선한다", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: { coords: { latitude: number; longitude: number } }) => void,
        ) => success({ coords: { latitude: 37.57, longitude: 127 } }),
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#marketResults button").first()).toContainText("가람시장");
  await page.locator("#btnNearbyMarkets").click();
  await expect(page.locator("#marketResults button").first()).toContainText("하늘시장");
  await expect(page.locator(".market-results-summary")).toContainText("가까운 순");
});

test("구매자 메뉴를 우측에 모으고 로그아웃 실패 시 현재 화면과 재시도를 유지한다", async ({
  page,
}) => {
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } }),
  );
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 500, json: { message: "로그아웃 실패" } }),
  );
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "구매자 메뉴" });
  await expect(nav.getByRole("button")).toHaveText([
    "장바구니",
    "주문 내역",
    "내 계정",
    "로그아웃",
  ]);
  await expect(page.locator(".health-status-badge")).toHaveCount(0);
  await nav.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#heading-market")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(nav.getByRole("button", { name: "로그아웃", exact: true })).toBeEnabled();
});

test("지도 안쪽 검색은 주변 조건을 대체하고 이동 중 조회·빈 결과·실패 재시도에도 지도 위치를 유지한다", async ({
  page,
}) => {
  let releaseAuth!: () => void;
  const authReady = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  await page.route("**/api/auth/me", async (route) => {
    await authReady;
    await route.fulfill({
      json: {
        id: 1,
        loginId: "test_buyer",
        displayName: "구매자",
        role: "BUYER",
        requiresPasswordChange: false,
      },
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const modulePath =
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => new URL(url).pathname === "/src/api/mapSdk.ts")
        .at(-1) ?? "/src/api/mapSdk.ts";
    const sdk = (await import(modulePath)) as typeof import("../src/api/mapSdk");
    const state = window as unknown as { moveMap: (bounds: MapBounds) => void; mapMounts: number };
    state.mapMounts = 0;
    const provider: MapSdkProvider = {
      loadSdk: () => Promise.resolve(),
      geocode: () => Promise.reject(new Error("미사용")),
      reverseGeocode: () => Promise.reject(new Error("미사용")),
      mountAdminPicker: () => {
        throw new Error("미사용");
      },
      mountBuyerOverview: (container, options) => {
        ++state.mapMounts;
        state.moveMap = (bounds) => options.onViewportChange?.(bounds);
        return {
          update: (markets) => {
            container.dataset.marketIds = markets.map((m) => m.id).join(",");
          },
          destroy: () => {},
        };
      },
    };
    sdk.setMapSdkProvider(provider);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: (position: { coords: { latitude: number; longitude: number } }) => void,
        ) => success({ coords: { latitude: 37.57, longitude: 127 } }),
      },
    });
  });
  releaseAuth();
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  const search = page.getByRole("button", { name: "이 지도에서 시장 찾기", exact: true });
  await expect(search).toHaveCount(0);
  await page.locator("#buyerInputMarketName").fill("하늘");
  await page.locator("#btnNearbyMarkets").click();
  await expect(page.locator("#marketResults button")).toHaveCount(1);
  await expect(page.locator("#marketResults button").first()).toBeEnabled();
  const mounts = await page.evaluate(() => (window as unknown as { mapMounts: number }).mapMounts);
  const seoul: MapBounds = { south: 37.56, west: 126.99, north: 37.58, east: 127.01 };
  const anyang: MapBounds = { south: 37.3, west: 126.9, north: 37.45, east: 126.97 };
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/markets") ++requests;
  });
  const move = (bounds: MapBounds) =>
    page.evaluate(
      (b) => (window as unknown as { moveMap: (b: MapBounds) => void }).moveMap(b),
      bounds,
    );
  await move(seoul);
  await expect(search).toBeVisible();
  expect(requests).toBe(0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const frame = await page.locator(".buyer-map-frame").boundingBox();
    const button = await search.boundingBox();
    expect(button!.x).toBeGreaterThanOrEqual(frame!.x);
    expect(button!.x + button!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
    expect(button!.y).toBeGreaterThanOrEqual(frame!.y);
    expect(button!.y + button!.height).toBeLessThan(frame!.y + frame!.height);
  }
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = true;
  await page.route("**/api/markets", async (route) => {
    if (hold) {
      hold = false;
      await ready;
    }
    await route.fallback();
  });
  await search.click();
  await expect(page.getByRole("button", { name: "찾는 중…", exact: true })).toBeDisabled();
  await move(anyang);
  release();
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  await expect(search).toBeEnabled();
  await expect(page.locator("#buyerInputMarketName")).toHaveValue("");
  await expect(page.locator("#btnNearbyMarkets")).not.toHaveClass(/active/);
  await expect(page.locator(".market-results-summary")).toContainText("가나다순");
  await search.click();
  await expect(page.locator(".buyer-market-results #buyerMarketEmpty")).toBeVisible();
  await expect(search).toHaveCount(0);
  await move(seoul);
  await page.route(
    "**/api/markets",
    (route) => route.fulfill({ status: 503, json: { message: "지도 범위 조회 실패" } }),
    { times: 1 },
  );
  await search.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("#buyerMarketEmpty")).toHaveCount(0);
  await expect(search).toBeEnabled();
  await search.click();
  await expect(page.locator("#marketResults button")).toHaveCount(10);
  await expect(search).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { mapMounts: number }).mapMounts)).toBe(
    mounts,
  );
  await page
    .getByRole("navigation", { name: "시장 검색 결과 페이지" })
    .getByRole("button", { name: "다음 페이지" })
    .click();
  await expect(page.locator("#marketResults button")).toHaveCount(4);
  expect(await page.evaluate(() => (window as unknown as { mapMounts: number }).mapMounts)).toBe(
    mounts,
  );
});
