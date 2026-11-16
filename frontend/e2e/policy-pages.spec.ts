import { expect, test, type Page } from "@playwright/test";

// 인증·OAuth 응답은 브라우저 대역이다. 실제 제공자·백엔드 검증과 구분한다.
async function mockAuth(page: Page, flow?: () => object): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/csrf") {
        await route.fulfill({ json: { token: "mock-csrf", headerName: "X-CSRF-TOKEN" } });
      } else if (path === "/api/auth/oauth/providers") {
        await route.fulfill({ json: { providers: ["kakao", "google"] } });
      } else if (path === "/api/auth/oauth/flow" && flow) {
        await route.fulfill({ json: flow() });
      } else {
        await route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED" } });
      }
    },
  );
}

test("정책 문서는 로그인 없이 직접 열 수 있다", async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.abort(),
  );
  await page.goto("/policies/terms.html");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("이용안내·약관");
  await expect(page.locator("main")).toContainText("실제 대금 결제나");
  await page.locator("nav").getByRole("link", { name: "개인정보처리방침 (검토용)" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("개인정보처리방침 (검토용)");
  await expect(page.locator(".policy-callout")).toContainText("검토용 문서입니다.");
  await expect(page.locator("main")).toContainText("운영자 및 개인정보 문의처: 확정 전");
});

test("푸터와 가입 안내에서 문서를 새 탭으로 열어도 원래 화면과 입력이 유지된다", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/");
  await expect(page.locator("#screen-login")).toBeVisible();
  const originalUrl = page.url();
  const termsPopup = page.waitForEvent("popup");
  await page.locator("footer").getByRole("link", { name: "이용안내·약관" }).click();
  const terms = await termsPopup;
  await expect(terms.getByRole("heading", { level: 1 })).toHaveText("이용안내·약관");
  await terms.close();
  await expect(page).toHaveURL(originalUrl);

  await page.getByRole("button", { name: "구매자 회원가입하기" }).click();
  await page.locator("#signupUserId").fill("reviewbuyer");
  await page.locator("#signupEmail").fill("review@example.com");
  await page.locator("#signupPassword").fill("ReviewPass123!");
  const privacyPopup = page.waitForEvent("popup");
  await page
    .locator(".signup-policy-notice")
    .getByRole("link", { name: "개인정보처리방침 (검토용)" })
    .click();
  const privacy = await privacyPopup;
  await expect(privacy.getByRole("heading", { level: 1 })).toHaveText("개인정보처리방침 (검토용)");
  await privacy.close();
  await expect(page.locator("#signupUserId")).toHaveValue("reviewbuyer");
  await expect(page.locator("#signupEmail")).toHaveValue("review@example.com");
  await expect(page.locator("#signupPassword")).toHaveValue("ReviewPass123!");
});

test("소셜 가입의 문서 열람은 입력과 콜백 위치를 보존하고 계정 연결에는 가입 안내가 없다", async ({
  page,
}) => {
  let status = "SIGNUP";
  await mockAuth(page, () => ({
    status,
    provider: "kakao",
    displayName: "소셜구매자",
    email: "social@example.com",
    linkVerified: false,
  }));
  await page.goto("/#oauth");
  await expect(page.locator("#screen-oauth-signup")).toBeVisible();
  await page.locator("#oauthDisplayName").fill("새별명");
  const documentPopup = page.waitForEvent("popup");
  await page.locator(".signup-policy-notice").getByRole("link", { name: "이용안내·약관" }).click();
  const document = await documentPopup;
  await expect(document.getByRole("heading", { level: 1 })).toHaveText("이용안내·약관");
  await document.close();
  await expect(page).toHaveURL(/#oauth$/);
  await expect(page.locator("#oauthDisplayName")).toHaveValue("새별명");
  await expect(page.locator("#oauthEmail")).toHaveValue("social@example.com");

  status = "LINK";
  await page.reload();
  await expect(page.locator("#screen-oauth-link")).toBeVisible();
  await expect(page.locator(".signup-policy-notice")).toHaveCount(0);
});
