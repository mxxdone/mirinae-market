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
  await expect(page.locator("#adminSelectRegion")).toHaveValue("44133");
  await page.locator("#adminCandidateSearch").fill("궁평항해오름수산시장");
  await page.locator("#btnSearchCandidates").click();
  await expect(page.locator(".candidate-row")).toContainText("궁평항해오름수산시장");
  await page.locator(".candidate-row .btn-select-candidate").first().click();
  await expect(page.locator("#adminSelectRegion")).toHaveValue("");
  await page.locator("#adminCandidateSearch").fill("성정시장");
  await page.locator("#btnSearchCandidates").click();
  await expect(page.locator(".candidate-row")).toContainText("성정시장");
  await page.locator(".candidate-row .btn-select-candidate").first().click();
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
  await page.getByRole("button", { name: "시장 상품 둘러보기" }).click();
  await expect(page.locator("#marketSelect")).toContainText(`지도시장_${suffix}`);
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
