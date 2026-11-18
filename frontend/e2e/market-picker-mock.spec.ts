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
          hasLocalPassword: true,
        };
      else if (url.pathname === "/api/auth/refresh")
        body = { authenticated: true, accessToken: "mock-access-token", expiresIn: 600 };
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

test("시장 선택 제목의 자동 포커스에는 테두리가 없고 검색 버튼의 키보드 포커스는 표시한다", async ({
  page,
}) => {
  await page.goto("/");
  const heading = page.locator("#heading-market");
  await expect(heading).toBeFocused();
  await expect(heading).toHaveCSS("outline-style", "none");

  await page.keyboard.press("Tab");
  const searchButton = page.locator("#btnSearchMarketName");
  await searchButton.focus();
  await expect(searchButton).toHaveCSS("outline-style", "solid");
  await expect(searchButton).toHaveCSS("outline-width", "3px");
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
        {
          code: "48125",
          provinceCode: "48",
          provinceName: "경상남도",
          provinceShortName: "경남",
          districtName: "창원시 마산합포구",
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
  const province = page.locator("#buyerSelectProvince");
  const district = page.locator("#buyerSelectDistrict");
  const filterBounds = () =>
    page.locator(".filter-controls-row > .field-group").evaluateAll((fields) =>
      fields.map((field) => {
        const { x, y, width } = field.getBoundingClientRect();
        return { x, y, width };
      }),
    );
  const initialBounds = await filterBounds();
  const initial = searches.length;
  await province.selectOption("11");
  await district.selectOption("11110");
  expect(await filterBounds()).toEqual(initialBounds);
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
  await province.selectOption("26");
  await expect(district).toHaveValue("");
  await expect(district.locator("option")).toHaveText(["전체 시군구", "중구"]);
  await province.selectOption("48");
  await expect(district.locator("option")).toHaveText(["전체 시군구", "창원시 마산합포구"]);
  expect(await filterBounds()).toEqual(initialBounds);
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
        hasLocalPassword: true,
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
  await expect(nav.getByRole("button")).toHaveCount(2);
  const accountMenu = nav.getByRole("button", { name: "계정 메뉴", exact: true });
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");
  await accountMenu.click();
  await expect(page.locator("#buyer-account-menu button")).toHaveText([
    "내 계정",
    "주문 내역",
    "로그아웃",
  ]);
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeFocused();
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");
  await accountMenu.click();
  await page.locator("#heading-market").click();
  await expect(accountMenu).toHaveAttribute("aria-expanded", "false");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const brand = await page.getByRole("button", { name: "미리내마켓 홈" }).boundingBox();
    const actions = await nav.boundingBox();
    if (!brand || !actions) throw new Error("공통 헤더가 없습니다.");
    expect(Math.abs(brand.y - actions.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect(page.locator(".health-status-badge")).toHaveCount(0);
  await accountMenu.click();
  await nav.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator("#heading-market")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(accountMenu).toBeEnabled();
  await accountMenu.click();
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
        hasLocalPassword: true,
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

test("탈퇴 제한 응답은 계정 화면과 확인창을 유지하고 비밀번호를 비운다", async ({ page }) => {
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } }),
  );
  await page.route("**/api/buyer/withdrawal", (route) =>
    route.fulfill({
      status: 409,
      json: {
        code: "WITHDRAWAL_BLOCKED",
        message: "진행 중인 주문이나 환불을 먼저 확인해 주세요.",
      },
    }),
  );
  await page.goto("/#account");
  await expect(page.locator("#heading-buyer-summary")).toBeVisible();
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "회원 탈퇴하시겠어요?" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await page.locator("#withdrawal-password").fill("TestPass1234!");
  await dialog.getByRole("button", { name: "탈퇴하기", exact: true }).click();
  await expect(page.locator("#withdrawal-error")).toContainText("진행 중인 주문이나 환불");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#withdrawal-password")).toHaveValue("");
  await expect(page.locator("#userSummaryLoginId")).toHaveText("test_buyer");
});

test("표시 이름 변경 시 지연 응답 중 중복 제출을 차단하고 500 오류 시 기존 이름을 유지하며 401 시 세션 만료로 전환한다", async ({
  page,
}) => {
  let patchCalls = 0;
  let statusToReturn = 200;
  let resolveDeferredPatch: () => void = () => {
    throw new Error("지연 응답 해제 함수를 준비하지 못했습니다.");
  };
  const deferredPatch = new Promise<void>((resolve) => {
    resolveDeferredPatch = resolve;
  });
  let isDeferred = false;

  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } }),
  );
  await page.route("**/api/buyer/profile", async (route) => {
    patchCalls += 1;
    if (isDeferred) {
      await deferredPatch;
    }
    if (statusToReturn === 401) {
      await route.fulfill({
        status: 401,
        json: { code: "UNAUTHENTICATED", message: "인증이 만료되었습니다." },
      });
      return;
    }
    if (statusToReturn === 500) {
      await route.fulfill({
        status: 500,
        json: { code: "INTERNAL_ERROR", message: "서버 처리 오류가 발생했습니다." },
      });
      return;
    }
    await route.fulfill({ json: { displayName: "수정된이름" } });
  });

  await page.goto("/#account");
  await expect(page.locator("#heading-buyer-summary")).toBeVisible();
  await expect(page.locator("#userSummaryDisplayName")).toHaveText("구매자");

  // 1) 500 오류 시 기존 이름 유지 및 오류 안내 (첫 번째 요청)
  statusToReturn = 500;
  isDeferred = false;
  await page.locator("#inputChangeDisplayName").fill("실패테스트");
  await page.locator("#btnSubmitChangeDisplayName").click();
  await expect(page.locator("#changeDisplayNameStatus")).toHaveText(
    "서버 처리 오류가 발생했습니다.",
  );
  await expect(page.locator("#userSummaryDisplayName")).toHaveText("구매자");
  expect(patchCalls).toBe(1);

  // 2) 지연 응답 중 중복 제출 차단 검증 (결정적 deferred promise 해제)
  statusToReturn = 200;
  isDeferred = true;
  await page.locator("#inputChangeDisplayName").fill("지연테스트");
  await page.locator("#btnSubmitChangeDisplayName").click();

  // 버튼 비활성화 및 로딩 문구 확인
  const submitBtn = page.locator("#btnSubmitChangeDisplayName");
  await expect(submitBtn).toBeDisabled();
  await expect(submitBtn).toHaveText("저장 중…");
  await expect.poll(() => patchCalls).toBe(2);

  // 진행 중 추가 클릭 시도 (비활성화 상태이므로 추가 PATCH 요청이 발생하지 않아야 함)
  await submitBtn.click({ force: true });
  expect(patchCalls).toBe(2);

  // 지연된 응답 해제
  resolveDeferredPatch();
  await expect(submitBtn).toBeEnabled();
  await expect(page.locator("#changeDisplayNameStatus")).toHaveText("표시 이름이 변경되었습니다.");
  await expect(page.locator("#userSummaryDisplayName")).toHaveText("수정된이름");
  expect(patchCalls).toBe(2);

  // 3) 401 응답 시 세션 만료 전환
  isDeferred = false;
  statusToReturn = 401;
  await page.locator("#inputChangeDisplayName").fill("만료테스트");
  await page.locator("#btnSubmitChangeDisplayName").click();
  await expect(page.locator("#heading-login")).toBeVisible();
  expect(patchCalls).toBe(3);
});

for (const delayedStatus of [200, 401]) {
  test(`계정 전환 뒤 도착한 이전 이름 변경 ${delayedStatus} 응답은 새 계정을 덮거나 만료시키지 않는다`, async ({
    page,
  }) => {
    let activeId = 1;
    let releasePatch: () => void = () => {
      throw new Error("지연 응답을 준비하지 못했습니다.");
    };
    const patchGate = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ json: { token: "test-csrf", headerName: "X-CSRF-TOKEN" } }),
    );
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        json: {
          id: activeId,
          loginId: activeId === 1 ? "first_buyer" : "second_buyer",
          displayName: activeId === 1 ? "이전구매자" : "새구매자",
          role: "BUYER",
          requiresPasswordChange: false,
          hasLocalPassword: true,
        },
      }),
    );
    await page.route("**/api/auth/logout", (route) => route.fulfill({ status: 204 }));
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        json: { authenticated: true, accessToken: "second-access-token", expiresIn: 600 },
      }),
    );
    await page.route("**/api/buyer/profile", async (route) => {
      await patchGate;
      await route.fulfill({
        status: delayedStatus,
        json:
          delayedStatus === 200
            ? { displayName: "이전계정별명" }
            : { code: "UNAUTHENTICATED", message: "이전 인증이 만료되었습니다." },
      });
    });

    await page.goto("/#account");
    await expect(page.locator("#userSummaryDisplayName")).toHaveText("이전구매자");
    await page.locator("#inputChangeDisplayName").fill("이전계정별명");
    const pendingRequest = page.waitForRequest("**/api/buyer/profile");
    await page.locator("#btnSubmitChangeDisplayName").click();
    await pendingRequest;

    await page.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.locator("#heading-login")).toBeVisible();
    activeId = 2;
    await page.locator("#loginUserId").fill("second_buyer");
    await page.locator("#loginPassword").fill("Pass1234!");
    await page.locator("#btnLoginSubmit").click();
    await expect(page.locator("#heading-market")).toBeVisible();
    await page.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "내 계정", exact: true }).click();
    await expect(page.locator("#userSummaryDisplayName")).toHaveText("새구매자");

    const delayedResponse = page.waitForResponse("**/api/buyer/profile");
    releasePatch();
    await (await delayedResponse).finished();
    // 브라우저의 응답 처리와 React 렌더를 다음 프레임까지 진행시킨 뒤 새 계정을 확인한다.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#userSummaryDisplayName")).toHaveText("새구매자");
    await expect(page.locator("#userSummaryLoginId")).toHaveText("second_buyer");
    await expect(page.locator("#heading-login")).toHaveCount(0);
  });
}
