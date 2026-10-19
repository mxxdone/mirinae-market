import { chooseBuyerMarket } from "./buyerMarket";
import { expect, test } from "@playwright/test";
import { installTestClock } from "./fixedTime";

test.beforeEach(async ({ page }) => {
  await installTestClock(page);
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[E2E] 필수 환경 변수 "${name}"이(가) 설정되지 않았습니다.`);
  }
  return value;
}

test.describe("미리내 마켓 Phase 4.5 관리자·판매자·구매자 연계 운영 흐름", () => {
  test("관리자 시장·매장·판매자 등록 -> 판매자 첫 비밀번호 변경 -> 상품 등록 및 당일 판매 공개 -> 구매자 시장 검색", async ({
    page,
  }) => {
    test.setTimeout(60000);

    const adminLoginId = required("E2E_ADMIN_LOGIN_ID");
    const adminPassword = required("E2E_ADMIN_PASSWORD");
    const buyerLoginId = required("E2E_BUYER_LOGIN_ID");
    const demoPassword = required("E2E_DEMO_PASSWORD");

    const uniqueSuffix = Date.now().toString().slice(-6);
    const marketName = `관리자시장_${uniqueSuffix}`;
    const storeName = `새벽점포_${uniqueSuffix}`;
    const sellerLoginId = `seller_${uniqueSuffix}`;
    const sellerFirstPassword = "FirstPassword1234!";
    const sellerNewPassword = "NewPassword1234!";
    const productName = `제주햇당근_${uniqueSuffix}`;

    // 1. 관리자 로그인 -> 시장 등록 -> 매장 및 새 판매자 동시 등록
    await page.goto("/");
    await page.locator("#loginUserId").fill(adminLoginId);
    await page.locator("#loginPassword").fill(adminPassword);
    await page.locator("#btnLoginSubmit").click();

    await expect(page.locator(".admin-workspace")).toBeVisible();
    await expect(page.locator(".admin-sidebar h1")).toHaveText("미리내 마켓 관리자");

    // 시장 등록 (후보 검색 및 선택으로 위치 필수 입력 자동 반영 후 저장)
    await page.locator('a[href="#admin/markets"]').click();
    await expect(page.locator(".admin-heading h2")).toHaveText("시장 목록");
    await page.locator("#btnAdminCreate").click();
    await page.locator("#adminCandidateSearch").fill("성정시장");
    await page.locator("#btnSearchCandidates").click();
    await expect(page.locator(".candidate-row").first()).toBeVisible();
    await page.locator(".candidate-row .btn-select-candidate").first().click();
    await page.locator("#btnEditMarketLocation").click();
    await page.locator("#adminInputName").fill(marketName);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
    await expect(page.locator(".info-data-table")).toContainText(marketName);

    // 매장 및 새 판매자 등록
    await page.locator('a[href="#admin/stores"]').click();
    await expect(page.locator(".admin-heading h2")).toHaveText("매장");
    await page.locator("#btnAdminCreate").click();
    await page.locator("#adminSelectMarket").selectOption({ label: marketName });
    await page.locator("#adminInputName").fill(storeName);
    await page.locator("#adminInputLoginId").fill(sellerLoginId);
    await page.locator("#adminInputPassword").fill(sellerFirstPassword);
    await page.locator("#adminInputContactName").fill("김담당");
    await page.locator("#adminInputContactPhone").fill("010-1234-5678");
    await page.locator("#adminInputEmail").fill(`${sellerLoginId}@example.com`);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
    await expect(page.locator(".info-data-table")).toContainText(storeName);

    // 관리자 로그아웃
    await page.locator("#btnAdminLogout").click();
    await expect(page.locator("#heading-login")).toBeVisible();

    // 2. 판매자 첫 로그인 -> 첫 비밀번호 필수 변경
    await page.locator("#loginUserId").fill(sellerLoginId);
    await page.locator("#loginPassword").fill(sellerFirstPassword);
    await page.locator("#btnLoginSubmit").click();

    // 첫 비밀번호 변경 화면 노출 및 업무 차단 확인
    await expect(page.getByRole("heading", { name: "첫 비밀번호 변경" })).toBeVisible();
    await expect(
      page.getByText("관리자에게 받은 비밀번호를 바꾼 뒤 판매 업무를 시작할 수 있습니다."),
    ).toBeVisible();
    await expect(page.locator("#sellerFirstProfileLoginId")).toHaveText(sellerLoginId);
    await expect(page.locator("#sellerFirstProfileContactName")).toHaveText("김담당");

    // 변경 성공 뒤 계정 재조회 장애가 빈 화면으로 이어지지 않아야 한다.
    await page.route("**/api/auth/me", (route) => route.abort("failed"));

    // 비밀번호 변경 실행
    await page.locator("#currentPassword").fill(sellerFirstPassword);
    await page.locator("#newPassword").fill(sellerNewPassword);
    await page.locator("#confirmPassword").fill(sellerNewPassword);
    await page.locator("#btnChangePassword").click();

    // 비밀번호 변경 성공 후 판매자 본인 매장 작업 공간으로 전환 확인
    await expect(page.locator("#heading-seller-store")).toHaveText(storeName);
    await expect(page.getByRole("button", { name: "상품 추가", exact: true })).toBeVisible();
    await page.unroute("**/api/auth/me");

    // 3. 판매자 상품 등록 및 당일 판매 공개
    await page.getByRole("button", { name: "상품 추가", exact: true }).click();
    await page.locator("#productName").fill(productName);
    await page.locator("#weightUnit").selectOption("g");
    await page.locator("#productUnitAmount").fill("500");
    await page.locator("#productDescription").fill("신선한 당일 제주 햇당근");
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();

    const saleRow = page.locator(".sale-table-row").filter({ hasText: productName });
    await expect(saleRow).toBeVisible();

    // 당일 판매 조건 일괄 설정
    await saleRow.getByRole("checkbox").check();
    await saleRow.getByRole("textbox").nth(0).fill("5000");
    await saleRow.getByRole("textbox").nth(1).fill("20");
    await page.locator("#orderDeadline").fill("14:00");
    await page.locator("#pickupStart").fill("15:00");
    await page.locator("#pickupEnd").fill("19:00");
    await page.getByRole("button", { name: "변경 사항 적용", exact: true }).click();
    await expect(page.locator(".market-success")).toContainText("변경 사항이 모두 적용되었습니다.");
    await expect(saleRow.locator(".sale-status-cell > span")).toHaveText("판매 중");

    // 매장 정보 탭에서 담당자 정보 조회 확인 (수정 불가, 읽기 전용)
    await page.locator('a[href="#seller/store"]').click();
    await expect(page.locator("#storeInfoName")).toHaveText(storeName);
    await expect(page.locator("#sellerProfileContactName")).toHaveText("김담당");
    await expect(page.locator("#sellerProfileContactPhone")).toHaveText("01012345678");
    await expect(page.getByText("담당자 정보 수정은 관리자에게 요청해 주세요.")).toBeVisible();

    // 판매자 로그아웃
    await page.locator("#btnLogoutSeller").click();
    await expect(page.locator("#heading-login")).toBeVisible();

    // 4. 구매자 로그인 -> 등록된 시장 선택 -> 상품 검색 확인
    await page.locator("#loginUserId").fill(buyerLoginId);
    await page.locator("#loginPassword").fill(demoPassword);
    await page.locator("#btnLoginSubmit").click();
    await expect(page.locator("#heading-market")).toBeVisible();

    await expect(page.locator("#heading-market")).toBeVisible();

    // 새로 등록된 시장 선택 후 상품 검색
    const marketOption = page.locator("#marketSelect option").filter({ hasText: marketName });
    const marketOptionValue = await marketOption.getAttribute("value");
    await chooseBuyerMarket(page, marketOptionValue!);
    await page.locator("#productSearch").fill(productName);
    await page.getByRole("button", { name: "상품 검색", exact: true }).click();

    const offerCard = page.locator(".offer-card").filter({ hasText: productName });
    await expect(offerCard).toBeVisible();
    await expect(offerCard.locator(".offer-store-name")).toHaveText(storeName);
    await expect(offerCard.locator(".offer-price")).toContainText("5,000");

    // 구매자 로그아웃
    await page.getByRole("button", { name: "내 계정", exact: true }).click();
    await page.locator("#btnLogout").click();
    await expect(page.locator("#heading-login")).toBeVisible();
  });

  test("관리자 시장·매장 이름 수정, 판매자 담당자 정보 수정 및 변경 이력 검색", async ({
    page,
  }) => {
    const adminLoginId = required("E2E_ADMIN_LOGIN_ID");
    const adminPassword = required("E2E_ADMIN_PASSWORD");

    const uniqueSuffix = Date.now().toString().slice(-6);
    const initialMarketName = `수정전시장_${uniqueSuffix}`;
    const initialStoreName = `수정전매장_${uniqueSuffix}`;
    const updatedMarketName = `수정후시장_${uniqueSuffix}`;
    const updatedStoreName = `수정후매장_${uniqueSuffix}`;
    const sellerLoginId = `seller_mod_${uniqueSuffix}`;

    // 관리자 로그인
    await page.goto("/");
    await page.locator("#loginUserId").fill(adminLoginId);
    await page.locator("#loginPassword").fill(adminPassword);
    await page.locator("#btnLoginSubmit").click();
    await expect(page.locator(".admin-workspace")).toBeVisible();

    // 시장 등록 (후보 검색 및 선택으로 위치 필수 입력 자동 반영)
    await page.locator('a[href="#admin/markets"]').click();
    await page.locator("#btnAdminCreate").click();
    await page.locator("#adminCandidateSearch").fill("성정시장");
    await page.locator("#btnSearchCandidates").click();
    await expect(page.locator(".candidate-row").first()).toBeVisible();
    await page.locator(".candidate-row .btn-select-candidate").first().click();
    await page.locator("#btnEditMarketLocation").click();
    await page.locator("#adminInputName").fill(initialMarketName);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");

    // 매장 및 판매자 등록
    await page.locator('a[href="#admin/stores"]').click();
    await page.locator("#btnAdminCreate").click();
    await page.locator("#adminSelectMarket").selectOption({ label: initialMarketName });
    await page.locator("#adminInputName").fill(initialStoreName);
    await page.locator("#adminInputLoginId").fill(sellerLoginId);
    await page.locator("#adminInputPassword").fill("InitPass1234!");
    await page.locator("#adminInputContactName").fill("이전담당");
    await page.locator("#adminInputContactPhone").fill("010-1111-2222");
    await page.locator("#adminInputEmail").fill(`${sellerLoginId}@example.com`);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");

    // 시장 이름 수정
    await page.locator('a[href="#admin/markets"]').click();
    await page.locator("#adminSearchQuery").fill(initialMarketName);
    const marketRow = page
      .locator(".info-data-table tbody tr")
      .filter({ hasText: initialMarketName });
    await expect(marketRow).toBeVisible();
    await marketRow.locator("button:has-text('상세')").click();
    await page.locator("#adminInputName").fill(updatedMarketName);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
    await page.locator("#adminSearchQuery").fill(updatedMarketName);
    await expect(page.locator(".info-data-table")).toContainText(updatedMarketName);

    // 매장 이름 수정
    await page.locator('a[href="#admin/stores"]').click();
    await page.locator("#adminSearchQuery").fill(initialStoreName);
    const storeRow = page
      .locator(".info-data-table tbody tr")
      .filter({ hasText: initialStoreName });
    await expect(storeRow).toBeVisible();
    await storeRow.locator("button:has-text('상세')").click();
    await page.locator("#adminInputName").fill(updatedStoreName);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
    await page.locator("#adminSearchQuery").fill(updatedStoreName);
    await expect(page.locator(".info-data-table")).toContainText(updatedStoreName);

    // 판매자 담당자 정보 수정 (관리자만 가능)
    await page.locator('a[href="#admin/sellers"]').click();
    await page.locator("#adminSearchQuery").fill(sellerLoginId);
    const sellerRow = page.locator(".info-data-table tbody tr").filter({ hasText: sellerLoginId });
    await expect(sellerRow).toBeVisible();
    await sellerRow.locator("button:has-text('상세')").click();
    await page.locator("#adminInputContactName").fill("새담당");
    await page.locator("#adminInputContactPhone").fill("010-3333-4444");
    await page.locator("#adminInputEmail").fill(`updated_${sellerLoginId}@example.com`);
    await page.locator("#btnAdminSubmit").click();
    await expect(page.locator("#adminNoticeBox")).toContainText("저장했습니다.");
    await expect(page.locator(".info-data-table")).toContainText("새담당");

    // 관리자 변경 이력 확인
    await page.locator('a[href="#admin/changes"]').click();
    await page.locator("#adminChangesType").selectOption("SELLER");
    await expect(page.locator(".info-data-table tbody tr").first()).toBeVisible();
    await page
      .locator(".info-data-table tbody tr")
      .first()
      .locator("button:has-text('상세')")
      .click();
    await expect(page.locator(".admin-detail")).toContainText("새담당");

    // 390px 모바일 화면 넘침 없음 확인
    await page.setViewportSize({ width: 390, height: 844 });
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noOverflow).toBe(true);

    // 접힌 모바일 메뉴에서 로그아웃합니다.
    await page.locator(".admin-mobile-menu").click();
    await page.locator("#btnAdminLogout").click();
    await expect(page.locator("#heading-login")).toBeVisible();
  });
});

test("관리자 메뉴 전환은 기존 본문과 크기를 유지하고 실패·연속 이동을 처리한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  await page.locator("#loginUserId").fill(required("E2E_ADMIN_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_ADMIN_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  const heading = page.locator(".admin-heading h2");
  const content = page.locator(".admin-content");
  const workspace = page.locator(".admin-workspace");
  await expect(page.locator(".admin-table-wrap tbody tr").first()).toBeVisible();
  const initialRows = await page.locator(".admin-table-wrap tbody").innerText();
  const initialBounds = await workspace.boundingBox();
  if (!initialBounds) throw new Error("관리자 작업 공간이 없습니다.");
  const baseHeight = await page.evaluate(() => {
    const main = document.querySelector(".main-viewport");
    const footer = document.querySelector(".app-footer");
    if (!main || !footer) throw new Error("앱 레이아웃이 없습니다.");
    const style = getComputedStyle(main);
    return (
      innerHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom) -
      footer.getBoundingClientRect().height
    );
  });

  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let orderRequests = 0;
  await page.route("**/api/admin/orders?*", async (route) => {
    orderRequests += 1;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await page.locator("#admin-nav-orders").click();
  await expect(content).toHaveAttribute("aria-busy", "true");
  await expect(content).toHaveAttribute("inert", "");
  await expect(heading).toHaveText("시장 목록");
  expect(await page.locator(".admin-table-wrap tbody").innerText()).toBe(initialRows);
  expect((await workspace.boundingBox())?.width).toBe(initialBounds.width);
  await page.screenshot({
    path: "../output/playwright/admin-navigation-overlay.png",
    fullPage: true,
  });
  release();
  await expect(heading).toHaveText("주문");
  await expect(content).toHaveAttribute("aria-busy", "false");
  expect(orderRequests).toBe(1);
  await page.unroute("**/api/admin/orders?*");

  await page.route("**/api/admin/sales?*", (route) =>
    route.fulfill({ status: 503, json: { message: "조회 장애 검증" } }),
  );
  await page.locator("#admin-nav-sales").click();
  await expect(page.locator(".admin-navigation-error")).toBeVisible();
  await expect(heading).toHaveText("주문");
  await expect(content).not.toHaveAttribute("inert", "");
  await page.unroute("**/api/admin/sales?*");
  await page.locator(".admin-navigation-error button").click();
  await expect(heading).toHaveText("판매 현황");
  await expect(page.locator(".admin-navigation-error")).toHaveCount(0);

  let releaseLate = () => {};
  const lateGate = new Promise<void>((resolve) => {
    releaseLate = resolve;
  });
  let finishLate = () => {};
  const lateFinished = new Promise<void>((resolve) => {
    finishLate = resolve;
  });
  await page.route("**/api/admin/orders?*", async (route) => {
    const response = await route.fetch();
    await lateGate;
    await route.fulfill({ response });
    finishLate();
  });
  await page.locator("#admin-nav-orders").click();
  await expect(content).toHaveAttribute("aria-busy", "true");
  await page.locator("#admin-nav-buyers").click();
  await expect(heading).toHaveText("구매자");
  releaseLate();
  await lateFinished;
  await expect(heading).toHaveText("구매자");
  await page.unroute("**/api/admin/orders?*");
  await page.goBack();
  await expect(heading).toHaveText("주문");

  for (const [section, title] of [
    ["markets", "시장 목록"],
    ["stores", "매장"],
    ["sellers", "판매자"],
    ["buyers", "구매자"],
    ["orders", "주문"],
    ["sales", "판매 현황"],
    ["changes", "변경 이력"],
  ] as const) {
    await page.locator(`#admin-nav-${section}`).click();
    await expect(heading).toHaveText(title);
    const bounds = await workspace.boundingBox();
    expect(bounds?.width).toBe(initialBounds.width);
    expect(bounds?.height).toBeGreaterThanOrEqual(baseHeight - 1);
    if (section === "orders" || section === "sales") {
      await page.locator("#adminSearchQuery").fill("없는메뉴_기본높이검증_893");
      await expect(page.locator("#adminBusyBox")).toHaveCount(0);
      await expect(page.locator(".admin-table-wrap tbody tr")).toHaveCount(0);
      expect((await workspace.boundingBox())?.width).toBe(initialBounds.width);
      expect((await workspace.boundingBox())?.height).toBeCloseTo(baseHeight, 1);
      const emptyArea = await page.locator(".admin-empty").boundingBox();
      const emptyMessage = await page.locator(".admin-empty p").boundingBox();
      if (!emptyArea || !emptyMessage) throw new Error("빈 결과 안내가 없습니다.");
      expect(emptyMessage.x + emptyMessage.width / 2).toBeCloseTo(
        emptyArea.x + emptyArea.width / 2,
        0,
      );
      expect(emptyMessage.y + emptyMessage.height / 2).toBeCloseTo(
        emptyArea.y + emptyArea.height / 2,
        0,
      );
      await page.screenshot({
        path: `../output/playwright/admin-empty-${section}.png`,
        fullPage: true,
      });
      await page.locator("#adminSearchQuery").fill("");
      await expect(page.locator("#adminBusyBox")).toHaveCount(0);
    }
  }
  await page.screenshot({
    path: "../output/playwright/admin-navigation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".admin-mobile-menu").click();
  await page.locator("#admin-nav-markets").click();
  await expect(heading).toHaveText("시장 목록");
  await expect(page.locator("#adminNavigation")).toBeHidden();
  await page.screenshot({
    path: "../output/playwright/admin-navigation-mobile.png",
    fullPage: true,
  });
  await page.locator("#adminSearchQuery").fill("없는모바일_빈결과_893");
  await expect(page.locator(".admin-empty")).toBeVisible();
  const emptyArea = await page.locator(".admin-empty").boundingBox();
  const emptyMessage = await page.locator(".admin-empty p").boundingBox();
  if (!emptyArea || !emptyMessage) throw new Error("모바일 빈 결과 안내가 없습니다.");
  expect(emptyMessage.x + emptyMessage.width / 2).toBeCloseTo(emptyArea.x + emptyArea.width / 2, 0);
  expect(emptyMessage.y + emptyMessage.height / 2).toBeCloseTo(
    emptyArea.y + emptyArea.height / 2,
    0,
  );
  await page.screenshot({ path: "../output/playwright/admin-empty-mobile.png", fullPage: true });
});

test.describe("관리자 시각 표시", () => {
  test.use({ timezoneId: "America/New_York" });
  test("변경·결제 시각은 한국 시간으로 초까지만 표시한다", async ({ page }) => {
    await page.route("**/api/admin/changes?*", (route) =>
      route.fulfill({
        json: [
          {
            id: 900001,
            occurredAt: "2026-10-16 14:35:39.23148+09",
            actorLoginId: "검증 관리자",
            targetType: "MARKET",
            targetId: 1,
          },
          {
            id: 900002,
            occurredAt: "2026-10-18T15:00:00.987654Z",
            actorLoginId: "검증 관리자",
            targetType: "MARKET",
            targetId: 2,
          },
        ],
      }),
    );
    await page.route("**/api/admin/orders?*", (route) =>
      route.fulfill({
        json: [
          {
            id: 900001,
            buyerLoginId: "검증 구매자",
            buyerName: "검증 이름",
            totalWon: "1000",
            confirmedAt: "2026-10-18T12:34:56.789-04:00",
          },
          {
            id: 900002,
            buyerLoginId: "검증 구매자",
            buyerName: "검증 이름",
            totalWon: "1000",
            confirmedAt: null,
          },
        ],
      }),
    );
    await page.goto("/");
    await page.locator("#loginUserId").fill(required("E2E_ADMIN_LOGIN_ID"));
    await page.locator("#loginPassword").fill(required("E2E_ADMIN_PASSWORD"));
    await page.locator("#btnLoginSubmit").click();
    await expect(page.locator(".admin-table-wrap tbody tr").first()).toBeVisible();
    await page.locator("#admin-nav-changes").click();
    await expect(page.locator('tbody [data-column="occurredAt"]')).toHaveText([
      "2026-10-16 14:35:39",
      "2026-10-19 00:00:00",
    ]);
    await page.locator(".admin-table-wrap tbody tr button").first().click();
    await expect(
      page.locator(".admin-values").getByText("2026-10-16 14:35:39", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "../output/playwright/admin-timestamp-seconds.png",
      fullPage: true,
    });
    await page.locator("#admin-nav-orders").click();
    await expect(page.locator('tbody [data-column="confirmedAt"]')).toHaveText([
      "2026-10-19 01:34:56",
      "-",
    ]);
  });
});
