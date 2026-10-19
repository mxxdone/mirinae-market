import { expect, test, type Page } from "@playwright/test";
import type { MapSdkProvider } from "../src/api/mapSdk";
import { installTestClock } from "./fixedTime";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}

async function login(page: Page, id: string, password: string) {
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#btnLoginSubmit").click();
  if (id === required("E2E_ADMIN_LOGIN_ID")) {
    await expect(page.locator(".admin-workspace")).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await installTestClock(page);
});

test("지도 장애 중 후보 등록이 가능하고 미확인 후보는 이전 지역을 재사용하지 않는다", async ({
  page,
}) => {
  await page.route("https://oapi.map.naver.com/**", (route) => route.abort());
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await page.locator("#btnAdminCreate").click();
  await page.locator("#adminCandidateSearch").fill("성정시장");
  await page.locator("#btnSearchCandidates").click();
  await page.locator(".candidate-row .btn-select-candidate").first().click();
  await expect(page.locator("#adminSelectedRegion")).toContainText("서북구");
  await expect(page.locator("#adminInputLatitude")).toHaveCount(0);
  await page.locator("#btnMarketBackToSearch").click();
  await page.locator("#adminCandidateSearch").fill("궁평항해오름수산시장");
  await page.locator("#btnSearchCandidates").click();
  await expect(page.locator(".candidate-row")).toContainText("궁평항해오름수산시장");
  await page.locator(".candidate-row .btn-select-candidate").first().click();
  await expect(page.locator("#adminSelectRegion")).toHaveValue("");
  await page.locator("#btnMarketBackToSearch").click();
  await page.locator("#adminCandidateSearch").fill("성정시장");
  await page.locator("#btnSearchCandidates").click();
  await expect(page.locator(".candidate-row")).toContainText("성정시장");
  await page.locator(".candidate-row .btn-select-candidate").first().click();
  await page.locator("#btnEditMarketLocation").click();
  await page.locator("#adminInputName").fill(`장애등록_${Date.now()}`);
  await page.locator("#btnAdminSubmit").click();
  await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
});

test("지도 SDK가 늦게 준비돼도 최신 시장을 표시하고 지역 전환 후 이전 위치 응답을 버린다", async ({
  page,
}) => {
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await expect(page.locator(".admin-workspace")).toBeVisible();
  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as {
    headerName: string;
    token: string;
  };
  const headers = { [csrf.headerName]: csrf.token };
  const suffix = Date.now().toString().slice(-9);
  const marketResponse = await page.request.post("/api/admin/markets", {
    headers,
    data: {
      name: `지도시장_${suffix}`,
      regionCode: "11110",
      address: "서울특별시 종로구 창경궁로 88",
      latitude: 37.57,
      longitude: 127.0,
    },
  });
  expect(marketResponse.status()).toBe(201);
  const market = (await marketResponse.json()) as { id: number };
  const storeResponse = await page.request.post("/api/admin/stores", {
    headers,
    data: {
      marketId: market.id,
      name: `지도매장_${suffix}`,
      loginId: `map_${suffix}`,
      password: "MapSeller1234!",
      email: `map_${suffix}@example.com`,
      contactName: "김담당",
      contactPhone: "01012345678",
    },
  });
  expect(storeResponse.status()).toBe(201);
  await page.locator("#btnAdminLogout").click();
  await expect(page.locator("#loginUserId")).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/api/mapSdk.ts";
    const sdk = (await import(modulePath)) as typeof import("../src/api/mapSdk");
    const state = window as unknown as {
      releaseMap: () => void;
      mapMarketIds: number[];
      releasePosition: () => void;
    };
    const provider: MapSdkProvider = {
      loadSdk: () =>
        new Promise<void>((resolve) => {
          state.releaseMap = resolve;
        }),
      geocode: () => Promise.reject(new Error("이 테스트에서는 주소 검색을 사용하지 않습니다.")),
      reverseGeocode: () =>
        Promise.reject(new Error("이 테스트에서는 참고 주소를 사용하지 않습니다.")),
      mountAdminPicker: () => {
        throw new Error("구매자 지도 테스트입니다.");
      },
      mountBuyerOverview: (_element, options) => {
        state.mapMarketIds = options.markets.map((m) => m.id);
        return {
          update: (markets) => {
            state.mapMarketIds = markets.map((m) => m.id);
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
        ) => {
          state.releasePosition = () => success({ coords: { latitude: 37.57, longitude: 127.0 } });
        },
      },
    });
  });
  await page.locator("#loginUserId").fill(required("E2E_BUYER_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();

  await expect(page.locator("#marketSelect")).toContainText(`지도시장_${suffix}`);
  await page.locator("#btnToggleBuyerMap").click();
  await page.evaluate(() => (window as unknown as { releaseMap: () => void }).releaseMap());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { mapMarketIds: number[] }).mapMarketIds))
    .toContain(market.id);
  await page.getByRole("button", { name: "내 주변 (10km)" }).click();
  await page.locator("#buyerSelectProvince").selectOption("26");
  await page.evaluate(() =>
    (window as unknown as { releasePosition: () => void }).releasePosition(),
  );
  await expect(page.locator("#buyerSelectProvince")).toHaveValue("26");
  await expect(page.locator("#marketSelect")).not.toContainText(`지도시장_${suffix}`);
});

test("주소 없이 지역만 고르면 시장이 나오고 좌표 입력 없이 등록한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://oapi.map.naver.com/**", (route) => route.abort());
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await page.locator("#btnAdminCreate").click();
  await expect(page.locator("#adminInputAddress")).toHaveCount(0);
  await expect(page.locator("#adminInputLatitude, #adminInputLongitude")).toHaveCount(0);
  await expect(page.locator("#adminSearchQuery")).toHaveCount(0);
  await expect(page.locator("#btnAdminSubmit")).toHaveCount(0);
  await page.locator("#adminCandidateProvince").selectOption("44");
  await page.locator("#adminCandidateRegion").selectOption("44133");
  const row = page.locator(".candidate-row").filter({ hasText: "성정시장" });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "선택", exact: true }).click();
  await expect(page.locator("#adminInputAddress")).toHaveText(/충청남도/);
  await expect(page.locator("#adminInputName")).toHaveCount(0);
  await expect(page.locator(".admin-mobile-menu")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#admin-nav-stores")).toBeHidden();
  await expect(page.locator("#btnGeocodeAddress")).toHaveCount(0);
  await expect(page.locator("#adminCandidateProvince")).toBeHidden();
  await expect(page.locator("#adminMapPicker")).toHaveCount(0);
  await page.locator("#btnMarketMapToggle").click();
  await expect(page.locator("#adminMapPicker")).toBeVisible();
  await page.locator("#btnMarketMapToggle").click();
  await expect(page.locator("#adminMapPicker")).toHaveCount(0);
  await page.locator("#btnMarketBackToSearch").click();
  await expect(page.locator("#adminCandidateProvince")).toHaveValue("44");
  await expect(page.locator("#adminCandidateRegion")).toHaveValue("44133");
  await page.locator("#adminCandidateProvince").selectOption("26");
  await expect(page.locator("#adminInputAddress")).toHaveCount(0);
  await page.locator("#adminCandidateProvince").selectOption("44");
  await page.locator("#adminCandidateRegion").selectOption("44133");
  await row.getByRole("button", { name: "선택", exact: true }).click();
  const name = `지역선택_${Date.now()}`;
  await page.locator("#btnEditMarketLocation").click();
  await page.locator("#adminInputName").fill(name);
  const saving = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/admin/markets"),
  );
  await page.locator("#btnAdminSubmit").click();
  const payload = (await saving).postDataJSON() as {
    regionCode: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  expect(payload.regionCode).toBe("44133");
  expect(payload.address.length).toBeGreaterThan(0);
  expect(Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)).toBe(true);
  await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
  await page
    .locator(".info-data-table tbody tr")
    .filter({ hasText: name })
    .getByRole("button", { name: /상세/ })
    .click();
  await expect(
    page.locator(".admin-values dt").filter({ hasText: /위도|경도|지역 코드|시도 코드/ }),
  ).toHaveCount(0);
});

test("지역 시장 목록 조회 실패 후 재시도하면 주소 없이 복구한다", async ({ page }) => {
  let failOnce = true;
  await page.route("**/api/admin/market-candidates?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("regionCode") === "44133" && failOnce) {
      failOnce = false;
      await route.abort();
    } else await route.continue();
  });
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await page.locator("#btnAdminCreate").click();
  await page.locator("#adminCandidateProvince").selectOption("44");
  await page.locator("#adminCandidateRegion").selectOption("44133");
  await page.getByRole("button", { name: "목록 다시 불러오기" }).click();
  await expect(page.locator(".candidate-row").filter({ hasText: "성정시장" })).toBeVisible();
  await expect(page.locator("#adminInputAddress")).toHaveCount(0);
});

test("목록에 없는 시장은 별도 주소 검색과 지도 지정으로 등록한다", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const modulePath = "/src/api/mapSdk.ts";
    const sdk = (await import(modulePath)) as typeof import("../src/api/mapSdk");
    sdk.setMapSdkProvider({
      loadSdk: () => Promise.resolve(),
      geocode: (query) => Promise.resolve({ address: query, latitude: 37.57, longitude: 127.0 }),
      reverseGeocode: () => Promise.reject(new Error("참고 주소 조회 실패")),
      mountAdminPicker: (element, options) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "테스트 지도에서 위치 지정";
        button.onclick = () => options.onCoordsChange({ latitude: 37.58, longitude: 127.01 });
        element.appendChild(button);
        return { setPosition: () => {}, destroy: () => element.replaceChildren() };
      },
      mountBuyerOverview: () => {
        throw new Error("관리자 직접 등록 테스트입니다.");
      },
    });
  });
  await page.locator("#loginUserId").fill(required("E2E_ADMIN_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_ADMIN_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await page.locator("#btnAdminCreate").click();
  await page.locator("#adminCandidateProvince").selectOption("44");
  await page.locator("#adminCandidateRegion").selectOption("44133");
  await page.locator("#btnToggleManualMarket").click();
  await expect(page.locator("#adminCandidateProvince")).toBeHidden();
  await page.locator("#btnMarketBackToSearch").click();
  await expect(page.locator("#adminCandidateRegion")).toHaveValue("44133");
  await page.locator("#btnToggleManualMarket").click();
  await page.locator("#adminSelectProvince").selectOption("11");
  await page.locator("#adminSelectRegion").selectOption("11110");
  await page.locator("#adminInputName").fill(`직접등록_${Date.now()}`);
  const address = "서울특별시 종로구 창경궁로 88";
  await page.locator("#adminInputAddress").fill(address);
  await page.locator("#btnGeocodeAddress").click();
  await expect(page.locator("#adminPositionStatus")).toContainText("지정되었습니다");
  await page.locator("#btnMarketMapToggle").click();
  await page.getByRole("button", { name: "테스트 지도에서 위치 지정" }).click();
  await expect(page.locator("#btnAdminSubmit")).toBeDisabled();
  await page.locator("#btnCancelMapPosition").click();
  await expect(page.locator("#btnAdminSubmit")).toBeEnabled();
  await page.getByRole("button", { name: "테스트 지도에서 위치 지정" }).click();
  await page.locator("#btnApplyMapPosition").click();
  await expect(page.locator("#btnAdminSubmit")).toBeEnabled();
  await expect(page.locator("#adminRefAddressError")).toContainText("참고 주소 조회 실패");
  await expect(page.locator("#adminInputAddress")).toHaveValue(address);
  await expect(page.locator("input[type=number]")).toHaveCount(0);
  const saving = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/admin/markets"),
  );
  await page.locator("#btnAdminSubmit").click();
  expect((await saving).postDataJSON()).toMatchObject({
    address,
    latitude: 37.58,
    longitude: 127.01,
  });
  await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
});

test("좁은 화면에서 관리 메뉴·시장 선택·정보 수정을 사용하고 가로 넘침이 없다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await expect(page.locator("#admin-nav-stores")).toBeHidden();
  await page.locator(".admin-mobile-menu").click();
  await page.locator("#admin-nav-stores").click();
  await expect(page.locator(".admin-mobile-menu")).toHaveAttribute("aria-expanded", "false");
  await page.locator(".admin-mobile-menu").click();
  await page.locator("#admin-nav-markets").click();
  await page.locator("#btnAdminCreate").click();
  await page.locator("#adminCandidateProvince").selectOption("44");
  await page.locator("#adminCandidateRegion").selectOption("44133");
  await page
    .locator(".candidate-row")
    .filter({ hasText: "성정시장" })
    .getByRole("button", { name: "선택", exact: true })
    .click();
  await expect(page.locator(".market-confirmation")).toContainText("성정시장");
  await expect(page.locator("#btnAdminDetailClose")).toHaveCount(0);
  await expect(page.locator("#btnMarketBackToSearch")).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#btnEditMarketLocation").click();
  await page.locator("#adminInputName").fill("수정한 이름");
  await page.locator("#btnMarketBackToSearch").click();
  await expect(page.locator(".market-confirmation")).toContainText("수정한 이름");
});

test("구매자는 시장 선택과 상품 탐색을 나누고 검색 조건을 유지해 시장을 변경한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, required("E2E_BUYER_LOGIN_ID"), required("E2E_DEMO_PASSWORD"));

  await expect(page.locator("#buyerSelectProvince")).toBeVisible();
  await expect(page.locator("#productSearch")).toBeHidden();
  await page.locator("#buyerInputMarketName").fill("미리내");
  await page.locator("#btnSearchMarketName").click();
  await expect(page.locator("#marketSelect")).toContainText("미리내시장");
  await page.locator("#btnToggleBuyerMap").click();
  await expect(page.locator(".buyer-market-map-section")).toBeVisible();
  await page.locator("#btnConfirmBuyerMarket").click();
  await expect(page.locator(".buyer-market-map-section")).toHaveCount(0);
  await expect(page.locator("#productSearch")).toBeVisible();
  await expect(page.locator("#buyerSelectProvince")).toBeHidden();
  await expect(page.locator(".buyer-current-market")).toContainText("미리내시장");
  await page.locator("#btnChangeBuyerMarket").click();
  await expect(page.locator(".buyer-market-map-section")).toBeVisible();
  await expect(page.locator("#buyerInputMarketName")).toHaveValue("미리내");
  await expect(page.locator("#productSearch")).toBeHidden();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test("로그인 후 장보기로 진입하고 내 계정은 직접 열 때만 표시한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, required("E2E_BUYER_LOGIN_ID"), required("E2E_DEMO_PASSWORD"));
  await expect(page.locator("#heading-market")).toBeVisible();
  await expect(page.locator("#heading-buyer-summary")).toHaveCount(0);
  await expect(page.locator("#buyerSelectProvince")).toBeVisible();
  await expect(page.locator("#btnConfirmBuyerMarket")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#buyerSelectProvince")).toBeVisible();
  await expect(page.locator("#productSearch")).toBeHidden();
  await expect(page.locator("#btnConfirmBuyerMarket")).toBeEnabled();
  await page.screenshot({ path: "../output/playwright/buyer-home-mobile.png", fullPage: true });
  await page.locator("#btnConfirmBuyerMarket").click();
  await expect(page.locator("#productSearch")).toBeVisible();
  const marketUrl = page.url();
  await page.getByRole("button", { name: "내 계정", exact: true }).click();
  await expect(page).toHaveURL(/#account$/);
  await expect(page.locator("#heading-buyer-summary")).toHaveText("내 계정");
  await page.screenshot({ path: "../output/playwright/buyer-account-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "장보기로 돌아가기", exact: true }).click();
  await expect(page).toHaveURL(marketUrl);
  await expect(page.locator("#productSearch")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#heading-buyer-summary")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#productSearch")).toBeVisible();
  await page.reload();
  await expect(page.locator("#productSearch")).toBeVisible();
  await page.getByRole("button", { name: "내 계정", exact: true }).click();
  await page.reload();
  await expect(page.locator("#heading-buyer-summary")).toHaveText("내 계정");
  await page.getByRole("button", { name: "장보기로 돌아가기", exact: true }).click();
  await expect(page).toHaveURL(marketUrl);
  await expect(page.locator("#productSearch")).toBeVisible();
  await page.getByRole("button", { name: "내 계정", exact: true }).click();
  await page.locator("#btnLogout").click();
  await expect(page.locator("#heading-login")).toBeVisible();
  await page.goto("/#account");
  await expect(page.locator("#heading-login")).toBeVisible();
  await expect(page.locator("#userSummaryLoginId")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#account$/);
});
