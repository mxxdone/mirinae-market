import { expect, test, type Page } from "@playwright/test";
import type { Checkout } from "../src/api/checkout";
import type { StoreOrderView } from "../src/api/operations";
import { installTestClock } from "./fixedTime";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}
function first<T>(items: T[]): T {
  const value = items[0];
  if (value === undefined) throw new Error("필수 fixture 또는 API 결과가 없습니다.");
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
async function orders(page: Page): Promise<Checkout[]> {
  const response = await page.request.get("/api/buyer/orders");
  expect(response.status()).toBe(200);
  return (await response.json()) as Checkout[];
}
async function fixture(page: Page, key: string): Promise<Checkout> {
  const result = (await orders(page)).find((order) => order.requestKey === key);
  if (!result) throw new Error(`독립 테스트 DB에 ${key} fixture가 필요합니다.`);
  return result;
}
async function buyerOrders(page: Page) {
  await page.getByRole("button", { name: "주문 내역", exact: true }).click();
  await expect(page.locator("#orders-heading")).toBeVisible();
}
async function refundCompleted(page: Page, order: StoreOrderView, amount: string) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/buyer/store-orders/${order.id}`);
        expect(response.status()).toBe(200);
        return ((await response.json()) as StoreOrderView).refundedWon;
      },
      { timeout: 15000 },
    )
    .toBe(amount);
  await page.locator("#btnRefreshOrders").click();
  await expect(page.locator(`[data-store-order-id="${order.id}"]`)).toContainText(
    `환불 완료 금액: ${BigInt(amount).toLocaleString()}원`,
  );
}
function adminRow(page: Page, id: number) {
  return page.locator("tbody tr").filter({
    has: page.locator('td[data-column="id"]').filter({ hasText: new RegExp(`^${id}$`) }),
  });
}

async function holdFirstResponse(page: Page, pattern: string) {
  let arrivedResolve = () => {};
  let releaseResolve = () => {};
  let finishedResolve = () => {};
  const arrived = new Promise<void>((resolve) => {
    arrivedResolve = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    finishedResolve = resolve;
  });
  await page.route(
    pattern,
    async (route) => {
      const response = await route.fetch();
      arrivedResolve();
      await released;
      try {
        await route.fulfill({ response });
      } finally {
        finishedResolve();
      }
    },
    { times: 1 },
  );
  return {
    arrived,
    release: async () => {
      releaseResolve();
      await finished;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    },
  };
}
async function loseFirstMutationResponse(page: Page, pattern: string) {
  const keys: string[] = [];
  await page.route(pattern, async (route) => {
    keys.push((route.request().postDataJSON() as { requestKey: string }).requestKey);
    if (keys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  return keys;
}

test.describe.serial("Phase 5 실제 주문 운영", () => {
  test.setTimeout(90000);

  test("일반 취소는 매장 전체를 취소하고 환불 완료를 표시한다", async ({ page }) => {
    await login(page, "fulfill_buyer", "buyer");
    const checkout = await fixture(page, "phase5-general");
    const order = first(checkout.storeOrders);
    expect(order.status).toBe("WAITING");
    await buyerOrders(page);
    const card = page.locator(`[data-store-order-id="${order.id}"]`);
    await expect(card.locator(".pickup-code-box")).toContainText(
      order.pickupCode ?? "missing-code",
    );
    const stale = await holdFirstResponse(page, "**/api/buyer/orders");
    await page.locator("#btnRefreshOrders").click();
    await stale.arrived;
    const keys = await loseFirstMutationResponse(
      page,
      `**/api/buyer/store-orders/${order.id}/cancellations`,
    );
    await page.locator(`#btnCancelOrder-${order.id}`).click();
    await page.locator("#btnConfirmCancellation").click();
    await expect(page.locator("#btnRetryCancellation")).toBeVisible();
    await expect(page.locator("#btnConfirmCancellation")).toBeEnabled();
    await page.locator("#btnConfirmCancellation").click();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await stale.release();
    await expect(page.locator(`#storeOrderStatus-${order.id}`)).toHaveText("취소 완료");
    await refundCompleted(page, order, "2000");
    await card.screenshot({ path: "../.local/verification/phase5-general-cancelled.png" });
  });

  test("판매 실패 응답 유실은 같은 키로 재시도하고 구매자가 나머지를 취소한다", async ({
    page,
  }) => {
    await login(page, "fulfill_buyer", "buyer");
    const order = first((await fixture(page, "phase5-failure")).storeOrders);
    expect(order.items.every((item) => !item.cancelled)).toBe(true);
    await logout(page, "buyer");
    await login(page, "fulfill_seller_ready", "seller");
    await page.locator("#navSellerOrders").click();
    await page.locator(`#btnViewSellerOrder-${order.id}`).click();
    const item = page
      .locator(".seller-order-detail-card .store-order-item")
      .filter({ hasText: "검증 사과" });
    await item.getByRole("checkbox").check();
    await page.locator("#sellerFailureReasonInput").fill("상품 상태 확인 후 제공 불가");
    await page.locator("#btnStartFailure").click();
    const keys: string[] = [];
    // HTTP·DB는 실제 처리하고 첫 응답만 유실시켜 클라이언트 재시도 키를 검증한다.
    await page.route("**/api/seller/stores/*/orders/*/failures", async (route) => {
      keys.push((route.request().postDataJSON() as { requestKey: string }).requestKey);
      if (keys.length === 1) {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.locator("#btnConfirmFailure").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("#btnConfirmFailure")).toBeEnabled();
    await page.locator("#btnConfirmFailure").click();
    await expect(page.locator("#sellerOrderNotice")).toContainText("완료");
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    await logout(page, "seller");
    await login(page, "fulfill_buyer", "buyer");
    await buyerOrders(page);
    const card = page.locator(`[data-store-order-id="${order.id}"]`);
    await expect(card).toContainText("상품 상태 확인 후 제공 불가");
    await page.locator(`#btnCancelRemaining-${order.id}`).click();
    await page.locator("#btnConfirmCancellation").click();
    await expect(page.locator(`#storeOrderStatus-${order.id}`)).toHaveText("취소 완료");
    await refundCompleted(page, order, "2000");
    await card.screenshot({ path: "../.local/verification/phase5-buyer-remainder-cancelled.png" });
  });

  test("같은 통합 주문의 한 매장만 수령하고 다른 매장은 미수령·미환불로 유지한다", async ({
    page,
  }) => {
    await login(page, "fulfill_buyer", "buyer");
    const checkout = await fixture(page, "phase5-collection");
    const ready = checkout.storeOrders.find((order) => order.storeName === "수령준비 검증매장");
    const missing = checkout.storeOrders.find((order) => order.storeName === "미수령 검증매장");
    if (!ready || !missing || !ready.pickupCode)
      throw new Error("수령/미수령 fixture가 누락됐습니다.");
    expect(ready.status).toBe("WAITING");
    expect(missing.status).toBe("NO_SHOW");
    expect(missing.refundedWon).toBe("0");
    await logout(page, "buyer");
    await login(page, "fulfill_seller_ready", "seller");
    await page.locator("#navSellerOrders").click();
    await page.locator(`#btnViewSellerOrder-${ready.id}`).click();
    await page.locator("#sellerPickupCodeInput").fill(ready.pickupCode);
    await page.locator("#btnSubmitPickup").click();
    await expect(page.locator("#sellerOrderDetailStatus")).toHaveText("수령 완료");
    await logout(page, "seller");
    await login(page, "fulfill_buyer", "buyer");
    await buyerOrders(page);
    await expect(page.locator(`#storeOrderStatus-${ready.id}`)).toHaveText("수령 완료");
    await expect(page.locator(`#storeOrderStatus-${missing.id}`)).toHaveText("미수령");
    const current = (await fixture(page, "phase5-collection")).storeOrders.find(
      (order) => order.id === missing.id,
    );
    expect(current?.refunds).toHaveLength(0);
    await page.screenshot({
      path: "../.local/verification/phase5-independent-pickup.png",
      fullPage: true,
    });
  });

  test("매장 제보를 관리자가 확인·완료하고 운영 중지와 해제를 별도로 처리한다", async ({
    page,
  }) => {
    await login(page, "fulfill_buyer", "buyer");
    const order = first((await fixture(page, "phase5-general")).storeOrders);
    await buyerOrders(page);
    const oldReports = await holdFirstResponse(
      page,
      `**/api/buyer/stores/${order.storeId}/reports`,
    );
    await page.locator(`#btnReportStore-${order.id}`).click();
    await oldReports.arrived;
    await page.locator("#reportTypeSelect").selectOption("LOCATION_ERROR");
    await page.locator("#reportDescriptionInput").fill("표시된 위치가 실제 매장 위치와 다릅니다.");
    await page.locator("#btnSubmitStoreReport").click();
    await expect(page.locator("#reportNoticeBox")).toContainText("접수");
    await oldReports.release();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    const response = await page.request.get(`/api/buyer/stores/${order.storeId}/reports`);
    const reports = (await response.json()) as { id: number; status: string }[];
    expect(reports).toHaveLength(1);
    expect(first(reports).status).toBe("OPEN");
    await page.locator("#btnCloseReportModal").click();
    await logout(page, "buyer");
    await login(page, env("E2E_ADMIN_LOGIN_ID"), "admin");
    await page.locator("#admin-nav-store-reports").click();
    await expect(page.locator(".admin-heading h2")).toHaveText("매장 제보");
    await adminRow(page, first(reports).id).getByRole("button", { name: /상세/ }).click();
    await page.locator("#adminReportNextStatus").selectOption("RESOLVED");
    await page.locator("#adminReportResolutionInput").fill("담당자 통화로 위치 정보 확인 완료");
    await page.locator("#btnAdminResolveReport").click();
    await expect(adminRow(page, first(reports).id)).toContainText("처리 완료");
    await page.locator("#admin-nav-stores").click();
    await expect(page.locator(".admin-heading h2")).toHaveText("매장");
    await page.locator("#adminSearchQuery").fill("검증매장");
    await adminRow(page, order.storeId).getByRole("button", { name: /상세/ }).click();
    await page.locator("#adminOperationReasonInput").fill("담당자에게 임시 휴업 확인");
    const lateOperation = await holdFirstResponse(
      page,
      `**/api/admin/stores/${order.storeId}/operation`,
    );
    await page.locator("#btnAdminToggleOperation").click();
    await lateOperation.arrived;
    const storeList = await page.request.get("/api/admin/stores?query=미수령%20검증매장");
    const other = first((await storeList.json()) as { id: number }[]);
    await adminRow(page, other.id).getByRole("button", { name: /상세/ }).click();
    await page.locator("#adminOperationReasonInput").fill("새 상세에서 작성 중인 사유");
    await lateOperation.release();
    await expect(page.locator("#adminOperationReasonInput")).toHaveValue(
      "새 상세에서 작성 중인 사유",
    );
    await page.locator("#btnAdminRefresh").click();
    await expect(adminRow(page, order.storeId)).toContainText("일반취소 검증매장");
    const stopped = await page.request.get("/api/admin/stores?query=일반취소%20검증매장");
    expect(first((await stopped.json()) as { suspended: boolean }[]).suspended).toBe(true);
    await adminRow(page, order.storeId).getByRole("button", { name: /상세/ }).click();
    await page.locator("#adminOperationReasonInput").fill("정상 영업 재개 확인");
    await page.locator("#btnAdminToggleOperation").click();
    await expect
      .poll(async () => {
        const result = await page.request.get("/api/admin/stores?query=일반취소%20검증매장");
        return first((await result.json()) as { suspended: boolean }[]).suspended;
      })
      .toBe(false);
  });

  test("미수령의 매장 귀책은 관리자 확인 사유를 기록해 예외 환불한다", async ({ page }) => {
    await login(page, "fulfill_buyer", "buyer");
    const checkout = await fixture(page, "phase5-collection");
    const order = checkout.storeOrders.find((item) => item.storeName === "미수령 검증매장");
    if (!order) throw new Error("미수령 fixture가 누락됐습니다.");
    expect(order.status).toBe("NO_SHOW");
    expect(order.refundedWon).toBe("0");
    await logout(page, "buyer");
    await login(page, env("E2E_ADMIN_LOGIN_ID"), "admin");
    await page.locator("#admin-nav-orders").click();
    await expect(page.locator(".admin-heading h2")).toHaveText("주문");
    await page.locator("#adminSearchQuery").fill(String(checkout.id));
    const operationPattern = `**/api/admin/orders/${checkout.id}/store-orders`;
    await page.route(operationPattern, (route) =>
      route.fulfill({ status: 503, json: { message: "일시적인 조회 실패" } }),
    );
    await adminRow(page, checkout.id).getByRole("button", { name: /상세/ }).click();
    await expect(page.getByRole("alert")).toContainText("주문 취소·환불 운영 정보");
    await page.unroute(operationPattern);
    await page.getByRole("button", { name: "다시 조회", exact: true }).click();
    await page.locator(`#adminCancelReasonType-${order.id}`).selectOption("STORE_FAULT");
    await page
      .locator(`#adminCancelReason-${order.id}`)
      .fill("휴업으로 상품을 제공하지 못한 사실 확인");
    const adminKeys = await loseFirstMutationResponse(
      page,
      `**/api/admin/store-orders/${order.id}/cancellations`,
    );
    await page.locator(`#btnAdminCancelOrder-${order.id}`).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(`#btnAdminCancelOrder-${order.id}`)).toBeEnabled();
    await page.locator(`#btnAdminCancelOrder-${order.id}`).click();
    expect(adminKeys).toHaveLength(2);
    expect(adminKeys[1]).toBe(adminKeys[0]);
    const card = page.locator(".admin-store-order-card").filter({ hasText: "미수령 검증매장" });
    await expect(card).toContainText("취소 완료");
    await expect(card).toContainText("휴업으로 상품을 제공하지 못한 사실 확인");
    await logout(page, "admin");
    await login(page, "fulfill_buyer", "buyer");
    await buyerOrders(page);
    await refundCompleted(page, order, "1000");
  });

  test("환불 재처리는 완료까지 반영하고 이전 401은 새 로그인에 영향을 주지 않는다", async ({
    page,
  }) => {
    await login(page, "fulfill_buyer", "buyer");
    const order = first((await fixture(page, "phase5-attention")).storeOrders);
    const refund = first(order.refunds);
    expect(refund.status).toBe("NEEDS_ATTENTION");
    await buyerOrders(page);
    await expect(page.locator(`[data-store-order-id="${order.id}"]`)).toContainText("확인 필요");
    await logout(page, "buyer");
    await login(page, env("E2E_ADMIN_LOGIN_ID"), "admin");
    await page.locator("#admin-nav-refunds").click();
    await expect(page.locator(".admin-heading h2")).toHaveText("환불");
    let release = () => {};
    let arrived = () => {};
    let finished = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      finished = resolve;
    });
    // 이전 세션에서 시작한 응답만 지연·401로 바꾸며 새 로그인은 실제 인증을 사용한다.
    await page.route(
      `**/api/admin/refunds/${refund.id}/retry`,
      async (route) => {
        arrived();
        await gate;
        await route.fulfill({
          status: 401,
          json: { code: "AUTHENTICATION_REQUIRED", message: "이전 세션 만료" },
        });
        finished();
      },
      { times: 1 },
    );
    await page.locator(`#btnRetryRefund-${refund.id}`).click();
    await started;
    await logout(page, "admin");
    await login(page, "fulfill_buyer", "buyer");
    release();
    await completed;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.locator("#heading-market")).toBeVisible();
    await expect(page.locator("#heading-login")).toHaveCount(0);
    await logout(page, "buyer");
    await login(page, env("E2E_ADMIN_LOGIN_ID"), "admin");
    await page.locator("#admin-nav-refunds").click();
    await expect(page.locator(".admin-heading h2")).toHaveText("환불");
    await page.locator(`#btnRetryRefund-${refund.id}`).click();
    await expect(page.locator("#adminNoticeBox")).toContainText("환불 재처리를 요청했습니다.");
    await expect
      .poll(
        async () => {
          const response = await page.request.get("/api/admin/refunds");
          expect(response.status()).toBe(200);
          return ((await response.json()) as { id: number; status: string }[]).find(
            (value) => value.id === refund.id,
          )?.status;
        },
        { timeout: 15000 },
      )
      .toBe("COMPLETED");
    await page.locator("#btnAdminRefresh").click();
    await expect(adminRow(page, refund.id)).toContainText("환불 완료");
    await logout(page, "admin");
    await login(page, "fulfill_buyer", "buyer");
    await buyerOrders(page);
    await refundCompleted(page, order, "1000");
  });

  test("390px 구매자·판매자·관리자 운영 화면은 가로 넘침 없이 표시한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "fulfill_buyer", "buyer");
    await buyerOrders(page);
    await expect(page.locator(".store-order-card").first()).toBeVisible();
    await expect(page.locator("#btnRefreshOrders")).toBeEnabled();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      )
      .toBe(true);
    await page.screenshot({
      path: "../.local/verification/phase5-buyer-mobile.png",
      fullPage: true,
    });
    await logout(page, "buyer");
    await login(page, "fulfill_seller_ready", "seller");
    await page.locator("#navSellerOrders").click();
    await expect(page.locator(".seller-orders-table")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      )
      .toBe(true);
    await page.locator('[id^="btnViewSellerOrder-"]').first().click();
    await expect(page.locator(".seller-order-detail-card")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      )
      .toBe(true);
    await page.screenshot({
      path: "../.local/verification/phase5-seller-mobile.png",
      fullPage: true,
    });
    await logout(page, "seller");
    await login(page, env("E2E_ADMIN_LOGIN_ID"), "admin");
    await page.goto("/#admin/store-reports");
    await expect(page.getByRole("heading", { name: "매장 제보", exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      )
      .toBe(true);
    await expect(page.locator(".admin-table-wrap tbody tr").first()).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".admin-table-wrap")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      )
      .toBe(true);
    await page.screenshot({ path: "../.local/verification/phase5-admin-mobile.png" });
  });
  test("제보 요청 중 세션 만료는 개인 주문과 수령 코드를 폐기한다", async ({ page }) => {
    await login(page, "fulfill_buyer", "buyer");
    const order = first((await fixture(page, "phase5-general")).storeOrders);
    await buyerOrders(page);
    await page.locator(`#btnReportStore-${order.id}`).click();
    await page.locator("#reportDescriptionInput").fill("위치 재확인 요청");
    await page.route(`**/api/buyer/stores/${order.storeId}/reports`, async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 401,
          json: { code: "AUTHENTICATION_REQUIRED", message: "다시 로그인해 주세요." },
        });
      else await route.continue();
    });
    await page.locator("#btnSubmitStoreReport").click();
    await expect(page.locator("#heading-login")).toBeVisible();
    await expect(page.locator(".store-order-card, .pickup-code-box")).toHaveCount(0);
  });
});
