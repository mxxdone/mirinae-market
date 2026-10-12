import { expect, test } from "@playwright/test";

/**
 * 환경 변수 필수 검증 헬퍼
 * 기본값을 제공하지 않으며, 미설정 시 skip하지 않고 명확하게 실패시킵니다.
 * 보안 규칙: 실제 자격증명 값은 콘솔에 출력하지 않습니다.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[E2E] 필수 환경 변수 "${name}"이(가) 설정되지 않았습니다.`);
  }
  return value;
}

test.describe("미리내 마켓 Phase 2 실제 인증 및 인가 흐름", () => {
  test("1. 실제 구매자 회원가입 -> 가입 완료 (자동 로그인 없음) -> 로그인 -> 페이지 새로고침 후 세션 유지 -> 로그아웃", async ({
    page,
  }) => {
    // 매 실행 고유한 ID 및 이메일 생성
    const uniqueSuffix = Date.now().toString().slice(-6);
    const testLoginId = `buyer_${uniqueSuffix}`;
    const testEmail = `buyer_${uniqueSuffix}@market.local`;
    const testName = `구매자${uniqueSuffix.slice(-3)}`;
    const testPassword = "Password1234!";
    const svgErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("attribute d")) {
        svgErrors.push(message.text());
      }
    });

    await page.goto("/");

    // 로그인 화면에서 회원가입으로 이동
    const toSignupBtn = page.locator('button:has-text("구매자 회원가입하기")');
    await toSignupBtn.click();
    await expect(page.locator("#heading-signup")).toBeVisible();

    // 4필드 입력 (임의 trim 없음)
    await page.locator("#signupUserId").fill(testLoginId);
    await page.locator("#signupEmail").fill(testEmail);
    await page.locator("#signupName").fill(testName);
    await page.locator("#signupPassword").fill(testPassword);
    expect(svgErrors).toEqual([]);

    // 가입 제출
    await page.locator("#btnSignupSubmit").click();

    // 가입 완료 화면 확인 (자동 로그인 없음 명시)
    await expect(page.locator("#heading-complete")).toBeVisible();
    await expect(page.locator("text=자동 로그인은 지원하지 않습니다")).toBeVisible();

    // 가입 완료 화면에서 로그인 화면으로 이동
    await page.locator("#btnGoToLogin").click();
    await expect(page.locator("#heading-login")).toBeVisible();

    // 인계된 아이디 확인 및 비밀번호 입력
    await expect(page.locator("#loginUserId")).toHaveValue(testLoginId);
    await expect(page.locator("#loginPassword")).toHaveValue("");
    await page.locator("#loginPassword").fill(testPassword);

    // 로그인 실행
    await page.locator("#btnLoginSubmit").click();

    // 구매자 계정 요약 화면 진입 확인
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#userSummaryDisplayName")).toHaveText(testName);
    await expect(page.locator("#userSummaryLoginId")).toHaveText(testLoginId);
    await expect(page.locator("#userSummaryRole")).toHaveText("구매자");

    // 페이지 새로고침 시에도 세션 유지 확인
    await page.reload();
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#userSummaryLoginId")).toHaveText(testLoginId);

    // 로그아웃 수행
    await page.locator("#btnLogout").click();
    await expect(page.locator("#heading-login")).toBeVisible();
  });

  test("2. 중복 아이디 또는 이메일 가입 실패 (409 DUPLICATE_ACCOUNT)", async ({ page }) => {
    const existingBuyerId = requireEnv("E2E_BUYER_LOGIN_ID");
    const demoPassword = requireEnv("E2E_DEMO_PASSWORD");

    await page.goto("/");
    await page.locator('button:has-text("구매자 회원가입하기")').click();
    await expect(page.locator("#heading-signup")).toBeVisible();

    // 이미 존재하는 계정 아이디로 가입 시도
    await page.locator("#signupUserId").fill(existingBuyerId);
    await page.locator("#signupEmail").fill(`new_${Date.now()}@market.local`);
    await page.locator("#signupName").fill("중복테스트");
    await page.locator("#signupPassword").fill(demoPassword);

    const duplicateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/accounts") && response.request().method() === "POST",
    );
    await page.locator("#btnSignupSubmit").click();
    const response = await duplicateResponse;
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_ACCOUNT" });

    // 실제 서버 계약과 중복 오류 배너를 함께 확인합니다.
    const alertBox = page.locator("#signupAlertBox");
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText("이미 사용 중인 ID 또는 이메일입니다.");
  });

  test("3. 잘못된 인증 자격증명으로 로그인 실패 (401 INVALID_CREDENTIALS)", async ({ page }) => {
    const buyerId = requireEnv("E2E_BUYER_LOGIN_ID");

    await page.goto("/");
    await expect(page.locator("#heading-login")).toBeVisible();

    await page.locator("#loginUserId").fill(buyerId);
    await page.locator("#loginPassword").fill("WrongPassword999!");

    await page.locator("#btnLoginSubmit").click();

    // 자격증명 불일치 인라인 오류 배너 확인
    const alertBox = page.locator("#loginAlertBox");
    await expect(alertBox).toBeVisible();
    await expect(alertBox).toContainText("아이디 또는 비밀번호가 일치하지 않습니다");
  });

  test("4. 구매자 계정의 매장 조회 시도 -> 403 권한 거부", async ({ page, context }) => {
    const buyerId = requireEnv("E2E_BUYER_LOGIN_ID");
    const demoPassword = requireEnv("E2E_DEMO_PASSWORD");
    const storeAId = requireEnv("E2E_STORE_A_ID");

    await page.goto("/");
    await page.locator("#loginUserId").fill(buyerId);
    await page.locator("#loginPassword").fill(demoPassword);
    await page.locator("#btnLoginSubmit").click();

    await expect(page.locator("#heading-buyer-summary")).toBeVisible();

    // 구매자 UI는 매장 진입을 제공하지 않으며, 같은 브라우저 세션의 직접 요청도 거부됩니다.
    const response = await context.request.get(`/api/seller/stores/${storeAId}`);
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    const currentStore = await context.request.get("/api/seller/stores/me");
    expect(currentStore.status()).toBe(403);
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#storeInfoId")).not.toBeVisible();

    // 로그아웃
    await page.locator("#btnLogout").click();
    await expect(page.locator("#heading-login")).toBeVisible();
  });

  test("5. [Regression] 판매자 로그인·새로고침 후 본인 매장 자동 조회 및 타 매장 접근 차단", async ({
    page,
    context,
  }) => {
    const sellerAId = requireEnv("E2E_SELLER_A_LOGIN_ID");
    const sellerBId = requireEnv("E2E_SELLER_B_LOGIN_ID");
    const demoPassword = requireEnv("E2E_DEMO_PASSWORD");
    const storeAId = requireEnv("E2E_STORE_A_ID");
    const storeBId = requireEnv("E2E_STORE_B_ID");

    for (const [sellerId, ownStoreId, foreignStoreId] of [
      [sellerAId, storeAId, storeBId],
      [sellerBId, storeBId, storeAId],
    ] as const) {
      await page.goto(`/?storeId=${foreignStoreId}`);
      await page.locator("#loginUserId").fill(sellerId);
      await page.locator("#loginPassword").fill(demoPassword);
      await page.locator("#btnLoginSubmit").click();
      await expect(page.locator("#storeInfoId")).toHaveText(ownStoreId);
      await expect(page.locator("#storeInfoRole")).toContainText("입점 상인");
      await expect(page.locator("#storeIdInput")).toHaveCount(0);
      await expect(page.locator("#btnQueryStore")).toHaveCount(0);

      await page.reload();
      await expect(page.locator("#storeInfoId")).toHaveText(ownStoreId);

      const response = await context.request.get(`/api/seller/stores/${foreignStoreId}`);
      expect(response.status()).toBe(403);
      expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
      await expect(page.locator("#storeInfoId")).toHaveText(ownStoreId);

      await page.locator("#btnLogoutSeller").click();
      await expect(page.locator("#heading-login")).toBeVisible();
    }
  });

  test("6. 서버 세션 만료 시 보호 자원 401 발생 -> 개인/매장 정보 폐기 및 로그인 안내", async ({
    page,
    context,
  }) => {
    const sellerAId = requireEnv("E2E_SELLER_A_LOGIN_ID");
    const demoPassword = requireEnv("E2E_DEMO_PASSWORD");

    await page.goto("/");
    await page.locator("#loginUserId").fill(sellerAId);
    await page.locator("#loginPassword").fill(demoPassword);
    await page.locator("#btnLoginSubmit").click();

    await expect(page.locator("#heading-seller-store")).toBeVisible();
    await expect(page.locator("#storeInfoId")).toBeVisible();

    // 초기 상품·수령 시간 조회가 완료된 뒤 세션을 만료시켜 재조회 자체의 401을 검증한다.
    await expect(page.getByRole("button", { name: "수령 시간 저장", exact: true })).toBeEnabled();
    await expect(page.getByText("상품 목록을 불러오는 중입니다.", { exact: true })).toHaveCount(0);

    // 별도 HTTP 요청으로 세션 로그아웃 호출하여 서버 세션 무효화
    const csrfResponse = await context.request.get("/api/auth/csrf");
    const csrf = (await csrfResponse.json()) as { headerName: string; token: string };
    const logoutResponse = await context.request.post("/api/auth/logout", {
      headers: { [csrf.headerName]: csrf.token },
    });
    expect(logoutResponse.status()).toBe(204);

    // UI에서 매장 재조회 시도 -> 401 응답 발생
    const expiredResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/seller/stores/me") && response.request().method() === "GET",
    );
    await page.locator("#btnRefreshStore").click();

    expect((await expiredResponse).status()).toBe(401);

    // 개인/매장 정보가 화면에서 즉시 폐기되고 로그인 화면으로 전환 및 안내 배너 표시 확인
    await expect(page.locator("#heading-login")).toBeVisible();
    await expect(page.locator("#loginAlertBox")).toContainText("세션이 만료되었습니다");
  });

  test("8. [Regression] 담당 매장 조회 통신 실패 후 재시도", async ({ page, context }) => {
    await page.goto("/");
    await page.locator("#loginUserId").fill(requireEnv("E2E_SELLER_A_LOGIN_ID"));
    await page.locator("#loginPassword").fill(requireEnv("E2E_DEMO_PASSWORD"));
    await page.locator("#btnLoginSubmit").click();
    const storeId = requireEnv("E2E_STORE_A_ID");
    await expect(page.locator("#storeInfoId")).toHaveText(storeId);

    await context.setOffline(true);
    await page.locator("#btnRefreshStore").click();
    const alert = page.locator("#storeAlertBox");
    await expect(alert).toContainText("서버와 통신할 수 없습니다.");
    await expect(page.locator("#storeInfoId")).not.toBeVisible();
    await expect(page.locator("#heading-seller-store")).toBeVisible();

    await context.setOffline(false);
    await alert.getByRole("button", { name: "다시 시도" }).click();
    await expect(page.locator("#storeInfoId")).toHaveText(storeId);
    await expect(alert).not.toBeVisible();
    await page.locator("#btnLogoutSeller").click();
    await expect(page.locator("#heading-login")).toBeVisible();
  });

  test("7. [Regression] 오프라인 통신 실패 시 로그아웃 거부 및 계정 정보 유지 -> 온라인 복구 후 재시도 성공", async ({
    page,
    context,
  }) => {
    const buyerId = requireEnv("E2E_BUYER_LOGIN_ID");
    const demoPassword = requireEnv("E2E_DEMO_PASSWORD");

    await page.goto("/");
    await page.locator("#loginUserId").fill(buyerId);
    await page.locator("#loginPassword").fill(demoPassword);
    await page.locator("#btnLoginSubmit").click();

    // 구매자 계정 요약 진입 확인
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#userSummaryLoginId")).toHaveText(buyerId);

    // 1) 브라우저 네트워크를 오프라인으로 전환
    await context.setOffline(true);

    // 2) 로그아웃 클릭
    await page.locator("#btnLogout").click();

    // 3) 통신 실패 시 개인정보(표시이름, 아이디, 역할)가 화면에 그대로 유지되어야 함
    await expect(page.locator("#heading-buyer-summary")).toBeVisible();
    await expect(page.locator("#userSummaryLoginId")).toHaveText(buyerId);

    // 4) 로그아웃 실패 안내 인라인 배너 확인 (role="alert", HealthBadge의 status와 구별)
    const logoutAlert = page.locator("#buyerLogoutAlert");
    await expect(logoutAlert).toBeVisible();
    await expect(logoutAlert).toContainText("서버와 통신할 수 없습니다.");

    // 5) 브라우저 네트워크 온라인 복구
    await context.setOffline(false);

    // 6) 로그아웃 재시도
    await page.locator("#btnLogout").click();

    // 7) 정상 로그아웃되어 로그인 화면으로 전환 및 개인정보 폐기 확인
    await expect(page.locator("#heading-login")).toBeVisible();
    await expect(page.locator("#userSummaryLoginId")).not.toBeVisible();
  });
});
