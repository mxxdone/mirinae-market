import { expect, test, type Page } from "@playwright/test";
import { installTestClock } from "./fixedTime";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}

async function login(page: Page, id: string, role: "buyer" | "seller" | "admin") {
  await installTestClock(page);
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page
    .locator("#loginPassword")
    .fill(env(role === "admin" ? "E2E_ADMIN_PASSWORD" : "E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(
    page.locator(
      role === "admin"
        ? ".admin-workspace"
        : role === "seller"
          ? "#heading-seller-store"
          : "#heading-market",
    ),
  ).toBeVisible();
}

async function logout(page: Page, role: "buyer" | "seller" | "admin") {
  if (role === "buyer") await page.goto("/#account");
  await page
    .locator(
      role === "buyer" ? "#btnLogout" : role === "seller" ? "#btnLogoutSeller" : "#btnAdminLogout",
    )
    .click();
  await expect(page.locator("#heading-login")).toBeVisible();
}

test.describe("판매자 대시보드 (Phase 6)", () => {
  test("판매자 메뉴에서 대시보드로 이동하고 직접 URL 및 새로고침과 뒤로가기를 지원한다", async ({
    page,
  }) => {
    await login(page, "dashboard_seller", "seller");

    // 1. 네비게이션 메뉴 클릭으로 대시보드 이동
    await page.locator("#navSellerDashboard").click();
    await expect(page).toHaveURL(/#seller\/dashboard$/);
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    // 2. 직접 URL 접근 및 새로고침
    await page.goto("/#seller/dashboard");
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();
    await page.reload();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    // 3. 브라우저 뒤로가기 / 앞으로가기
    await page.locator("a[href='#seller']").click();
    await expect(page).toHaveURL(/#seller$/);
    await page.goBack();
    await expect(page).toHaveURL(/#seller\/dashboard$/);
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    await logout(page, "seller");
  });

  test("판매 관리 작성 중 대시보드로 이동했다가 돌아와도 작성 데이터가 보존된다", async ({
    page,
  }) => {
    await login(page, "dashboard_seller", "seller");

    // 판매 관리 화면 로드 대기 후 상품 추가 버튼 클릭
    await expect(page.getByRole("button", { name: "상품 추가", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "상품 추가", exact: true }).click();
    await expect(page.locator("#heading-product-editor")).toBeVisible();
    await page.locator("#productName").fill("임시 등록 중인 사과");

    // 대시보드로 이동
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    // 판매 관리로 복귀
    await page.locator("a[href='#seller']").click();
    // 폼과 입력된 값이 보존되어 있어야 함
    await expect(page.locator("#heading-product-editor")).toBeVisible();
    await expect(page.locator("#productName")).toHaveValue("임시 등록 중인 사과");

    await logout(page, "seller");
  });

  test("일별 상태·준비 수량·누적 실적·선택 월 모의 결제의 실제 수치를 정확히 표시한다", async ({
    page,
  }) => {
    await login(page, "dashboard_seller", "seller");
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    // 기준 날짜 2026-10-13, 월 2026-10 조회
    await page.locator("#sellerDashboardDate").fill("2026-10-13");
    await page.locator("#sellerDashboardMonth").fill("2026-10");
    await page.locator("#btnRefreshDashboard").click();

    // 1. 일별 주문 상태 수치 검증 (total 4, waiting 2, picked 1, noShow 0, cancelled 1, partial 1)
    await expect(page.locator("#valDailyTotal")).toHaveText("4건");
    await expect(page.locator("#valDailyWaiting")).toHaveText("2건");
    await expect(page.locator("#valDailyPickedUp")).toHaveText("1건");
    await expect(page.locator("#valDailyNoShow")).toHaveText("0건");
    await expect(page.locator("#valDailyCancelled")).toHaveText("1건");
    await expect(page.locator("#metricPartiallyCancelledOrders")).toHaveText("1건");

    // 2. 상품별 준비 수량 표 검증 (사과 1개, 배 2개)
    const prepTable = page.locator("#tablePreparationItems");
    await expect(prepTable).toBeVisible();
    await expect(prepTable.locator("tbody tr")).toHaveCount(2);
    await expect(
      prepTable.locator("tbody tr", { hasText: "대시보드 사과" }).locator("td").last(),
    ).toHaveText("1");
    await expect(
      prepTable.locator("tbody tr", { hasText: "대시보드 배" }).locator("td").last(),
    ).toHaveText("2");

    // 3. 선택 월 모의 결제 검증 (결제 10,000원, 환불 2,000원, 차감 후 8,000원)
    await expect(page.locator("#valMonthlyPayment")).toHaveText("10,000원");
    await expect(page.locator("#valMonthlyRefund")).toHaveText("2,000원");
    await expect(page.locator("#valMonthlyNet")).toHaveText("8,000원");

    // 4. 누적 주문 실적 검증 (유효 주문 3건, 구매자 2명, 결제 10,000원, 환불 2,000원, 차감 후 8,000원)
    await expect(page.locator("#valLifetimeOrders")).toHaveText("3건");
    await expect(page.locator("#valLifetimeBuyers")).toHaveText("2명");
    await expect(page.locator("#valLifetimePayment")).toHaveText("10,000원");
    await expect(page.locator("#valLifetimeRefund")).toHaveText("2,000원");
    await expect(page.locator("#valLifetimeNet")).toHaveText("8,000원");

    // 5. 과거 월 2026-09 조회: 당월 금액은 0원, 누적 실적은 3건/2명/10,000원 유지
    await page.locator("#sellerDashboardMonth").fill("2026-09");
    await expect(page.locator("#valMonthlyPayment")).toHaveText("0원");
    await expect(page.locator("#valMonthlyRefund")).toHaveText("0원");
    await expect(page.locator("#valMonthlyNet")).toHaveText("0원");
    await expect(page.locator("#valLifetimeOrders")).toHaveText("3건");
    await expect(page.locator("#valLifetimeBuyers")).toHaveText("2명");

    // 6. 주문 없는 날짜 2026-10-14 조회: 일별 건수 0, 준비 목록 빈 상태 표시
    await page.locator("#sellerDashboardDate").fill("2026-10-14");
    await expect(page.locator("#valDailyTotal")).toHaveText("0건");
    await expect(page.locator("#valDailyWaiting")).toHaveText("0건");
    await expect(page.locator("#preparationEmpty")).toBeVisible();

    await logout(page, "seller");
  });

  test("조회 오류 시 옛 지표를 숨기고 재시도에 성공한다", async ({ page }) => {
    await login(page, "dashboard_seller", "seller");
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();

    // 정상 조회로 지표 확인
    await page.locator("#sellerDashboardDate").fill("2026-10-13");
    await expect(page.locator("#valDailyTotal")).toHaveText("4건");

    // 2026-10-15 조회에 503 오류 주입
    let failRequest = true;
    await page.route("**/api/seller/stores/*/dashboard?*date=2026-10-15*", async (route) => {
      if (failRequest) {
        await route.fulfill({
          status: 503,
          json: { code: "SERVICE_UNAVAILABLE", message: "일시적인 서버 오류입니다." },
        });
      } else {
        await route.continue();
      }
    });

    await page.locator("#sellerDashboardDate").fill("2026-10-15");
    await expect(page.locator("#sellerDashboardAlert")).toBeVisible();

    // 오류 발생 시 옛 날짜 지표가 새 날짜 지표로 오인되지 않도록 숨겨져야 함
    await expect(page.locator("#valDailyTotal")).toHaveCount(0);

    // 재시도 클릭 시 성공
    failRequest = false;
    await page.locator("#sellerDashboardAlert button").click();
    await expect(page.locator("#valDailyTotal")).toBeVisible();

    await logout(page, "seller");
  });

  test("대시보드를 벗어난 뒤 도착한 늦은 401 응답은 무시되며 세션을 만료시키지 않는다", async ({
    page,
  }) => {
    await login(page, "dashboard_seller", "seller");

    let release = () => {};
    let arrived = () => {};
    let finished = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const delivered = new Promise<void>((resolve) => {
      finished = resolve;
    });
    await page.route("**/api/seller/stores/*/dashboard*", async (route) => {
      arrived();
      await held;
      await route.fulfill({
        status: 401,
        json: { code: "UNAUTHENTICATED", message: "세션 만료" },
      });
      finished();
    });

    // 대시보드로 이동하여 요청 발생
    await page.locator("#navSellerDashboard").click();
    await started;

    // 대시보드가 로딩 중인 상태에서 즉시 판매 관리로 복귀 (대시보드 컴포넌트 언마운트)
    await page.locator("a[href='#seller']").click();
    await expect(page).toHaveURL(/#seller$/);

    // 언마운트된 후 늦은 401 응답 전달
    release();
    await delivered;

    // 401이 무시되어 로그인 화면으로 튕기지 않고 판매자 화면이 유지되어야 함
    await expect(page.locator("#heading-login")).toHaveCount(0);
    await expect(page.locator("#heading-seller-store")).toBeVisible();
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);

    await logout(page, "seller");
  });

  test("대시보드를 벗어났다가 다시 진입하면 매번 최신 지표를 새로 조회한다", async ({ page }) => {
    await login(page, "dashboard_seller", "seller");

    let queryCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/seller/stores/") && req.url().includes("/dashboard")) {
        queryCount++;
      }
    });

    // 1회차 진입
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();
    await expect(page.locator("#valDailyTotal")).toBeVisible();
    const countAfterFirst = queryCount;
    expect(countAfterFirst).toBeGreaterThanOrEqual(1);

    // 주문 관리로 이동
    await page.locator("#navSellerOrders").click();
    await expect(page.locator(".seller-orders-section")).toBeVisible();

    // 대시보드 2회차 재진입 -> fresh mount 및 재조회 발생
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();
    await expect(page.locator("#valDailyTotal")).toBeVisible();
    expect(queryCount).toBeGreaterThan(countAfterFirst);

    await logout(page, "seller");
  });

  test("날짜 변경의 이전 응답이 늦게 도착해도 마지막 선택 결과를 유지한다", async ({ page }) => {
    await login(page, "dashboard_seller", "seller");
    await page.locator("#navSellerDashboard").click();
    await expect(page.locator("#valDailyTotal")).toHaveText("4건");
    let release = () => {};
    let arrived = () => {};
    let finished = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const delivered = new Promise<void>((resolve) => {
      finished = resolve;
    });
    await page.route("**/api/seller/stores/*/dashboard?*date=2026-10-14*", async (route) => {
      const response = await route.fetch();
      arrived();
      await held;
      await route.fulfill({ response });
      finished();
    });
    await page.locator("#sellerDashboardDate").fill("2026-10-14");
    await started;
    await page.locator("#sellerDashboardDate").fill("2026-10-13");
    await expect(page.locator("#valDailyTotal")).toHaveText("4건");
    release();
    await delivered;
    await expect(page.locator("#daily-status-heading")).toContainText("2026-10-13");
    await expect(page.locator("#valDailyTotal")).toHaveText("4건");
    await logout(page, "seller");
  });

  test("390px 모바일 화면에서도 대시보드 지표와 표가 가로 넘침 없이 표시된다", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "dashboard_seller", "seller");
    await page.locator("#navSellerDashboard").click();

    await expect(page.locator("#seller-dashboard-heading")).toBeVisible();
    await expect(page.locator(".dashboard-metric-grid").first()).toBeVisible();

    // 390px 뷰포트 내 가로 스크롤 넘침 방지 검증
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      )
      .toBe(true);

    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true });

    await logout(page, "seller");
  });
});
