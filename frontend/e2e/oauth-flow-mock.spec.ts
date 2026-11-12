import { expect, test } from "@playwright/test";

/**
 * OAuth 흐름 화면의 StrictMode·409 복구 회귀다. API는 브라우저 route 대역이며 실제 카카오·구글 제공자 검증이 아니다.
 * 프런트 단위 테스트로는 확인할 수 없는 StrictMode 이중 effect와 409 후 flow 재조회 실패 복구를 실제 Vite(StrictMode)
 * 화면에서 고정한다.
 */
test.beforeEach(async ({ page }) => {
  // 테스트 고정 시각은 백엔드 e2e 프로필과 동일하게 맞춘다.
  const instant = process.env.E2E_FIXED_INSTANT;
  if (!instant || Number.isNaN(Date.parse(instant))) {
    throw new Error("E2E_FIXED_INSTANT에 백엔드와 동일한 ISO 시각을 설정해 주세요.");
  }
  await page.clock.install({ time: new Date(instant) });
});

function meBody(): unknown {
  return {
    id: 7,
    loginId: "oauth_buyer",
    displayName: "소셜구매자",
    role: "BUYER",
    requiresPasswordChange: false,
    hasLocalPassword: false,
    linkedProviders: ["kakao"],
  };
}

test("StrictMode에서 #oauth LOGIN 흐름이 refresh·me 후 시장 화면으로 진입하고 스피너가 멈춘다", async ({
  page,
}) => {
  let flowCalls = 0;
  let refreshCalls = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/") || url.pathname === "/actuator/health",
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      // 실 API 경로만 대역한다. /src/api/*.ts 같은 Vite 모듈 요청은 건드리지 않는다.
      if (path === "/actuator/health") {
        await route.fulfill({ json: { status: "UP" } });
        return;
      }
      if (path === "/api/auth/oauth/flow") {
        flowCalls += 1;
        await route.fulfill({ json: { status: "LOGIN", provider: "kakao", linkVerified: false } });
        return;
      }
      if (path === "/api/auth/refresh" && method === "POST") {
        refreshCalls += 1;
        await route.fulfill({
          json: { authenticated: true, accessToken: "mock-access-token", expiresIn: 600 },
        });
        return;
      }
      if (path === "/api/auth/csrf") {
        await route.fulfill({ json: { token: "mock-csrf", headerName: "X-CSRF-TOKEN" } });
        return;
      }
      if (path === "/api/auth/me") {
        await route.fulfill({ json: meBody() });
        return;
      }
      if (path === "/api/buyer/cart") {
        await route.fulfill({ json: { version: 0, items: [] } });
        return;
      }
      if (path === "/api/market-regions") {
        await route.fulfill({ json: [] });
        return;
      }
      if (path === "/api/markets") {
        // 시장 화면이 렌더되려면 최소 1개 시장이 필요하다.
        await route.fulfill({
          json: [
            {
              id: 1,
              name: "중앙시장",
              regionCode: null,
              provinceCode: null,
              regionLabel: null,
              address: null,
              latitude: null,
              longitude: null,
              distanceKm: null,
            },
          ],
        });
        return;
      }
      await route.fulfill({ json: [] });
    },
  );

  await page.goto("/#oauth");

  // StrictMode 이중 effect에서도 영구 스피너에 갇히지 않고 시장 진입 화면이 보인다.
  await expect(page.locator("#heading-market")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "소셜 로그인 처리 중…" })).toHaveCount(0);
  // flow 조회는 StrictMode 중복 마운트에도 공유되어 과도하게 반복되지 않는다.
  expect(flowCalls).toBeGreaterThanOrEqual(1);
  expect(refreshCalls).toBeGreaterThanOrEqual(1);
});

test("SIGNUP 409 LINK_REQUIRED 뒤 flow 재조회가 실패하면 로딩을 해제하고 재시도로 LINK 화면에 진입한다", async ({
  page,
}) => {
  let flowCalls = 0;
  let signupCalls = 0;
  let failNextFlow = false;

  await page.route(
    (url) => url.pathname.startsWith("/api/") || url.pathname === "/actuator/health",
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path === "/api/auth/oauth/flow") {
        flowCalls += 1;
        if (failNextFlow) {
          failNextFlow = false;
          await route.fulfill({
            status: 503,
            json: { code: "AUTH_UNAVAILABLE", message: "잠시 후" },
          });
          return;
        }
        if (signupCalls > 0) {
          // 409 이후 재조회는 연결 화면 상태를 돌려준다.
          await route.fulfill({ json: { status: "LINK", linkVerified: false } });
          return;
        }
        await route.fulfill({
          json: {
            status: "SIGNUP",
            provider: "kakao",
            displayName: "소셜손님",
            email: "social@example.com",
            linkVerified: false,
          },
        });
        return;
      }
      if (path === "/api/auth/oauth/signup" && method === "POST") {
        signupCalls += 1;
        // 409 뒤 flow 재조회를 한 번 실패시켜 복구 경로를 검증한다.
        failNextFlow = true;
        await route.fulfill({
          status: 409,
          json: {
            code: "LINK_REQUIRED",
            message: "같은 이메일의 기존 계정이 있습니다. 계정 연결을 확인해 주세요.",
          },
        });
        return;
      }
      if (path === "/api/auth/oauth/providers") {
        await route.fulfill({ json: { providers: ["kakao", "google"] } });
        return;
      }
      if (path === "/api/auth/csrf") {
        await route.fulfill({ json: { token: "mock-csrf", headerName: "X-CSRF-TOKEN" } });
        return;
      }
      if (path === "/api/auth/me") {
        await route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED", message: "미인증" } });
        return;
      }
      // mock 대역: 카트는 items를 가진 객체, 그 밖의 목록 API는 배열이어야 한다.
      if (path === "/api/buyer/cart") {
        await route.fulfill({ json: { version: 0, items: [] } });
        return;
      }
      await route.fulfill({ json: [] });
    },
  );

  await page.goto("/#oauth");
  await expect(page.locator("#heading-oauth-signup")).toBeVisible();

  await page.locator("#oauthDisplayName").fill("중복손님");
  await page.locator("#oauthEmail").fill("taken@example.com");
  await page.locator("#btnOAuthSignupSubmit").click();

  // 재조회가 503으로 실패해도 스피너에 갇히지 않고 오류와 재시도 버튼을 제공한다.
  await expect(page.getByRole("heading", { name: "소셜 로그인 처리 중…" })).toHaveCount(0);
  await expect(page.locator("#oauthErrorAlert")).toBeVisible();
  const retry = page.getByRole("button", { name: "연결 화면 다시 불러오기", exact: true });
  await expect(retry).toBeVisible();

  await retry.click();
  await expect(page.locator("#heading-oauth-link")).toBeVisible();
  expect(flowCalls).toBeGreaterThanOrEqual(2);
});
