import { expect, test, type Page } from "@playwright/test";
import type { Checkout } from "../src/api/checkout";
import { installTestClock } from "./fixedTime";

async function login(page: Page, id = "dashboard_buyer_a") {
  const password = process.env.E2E_DEMO_PASSWORD;
  if (!password) throw new Error("E2E_DEMO_PASSWORD 설정이 필요합니다.");
  await installTestClock(page);
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-market")).toBeVisible();
  const response = await page.request.get("/api/buyer/orders");
  expect(response.status()).toBe(200);
  const orders = (await response.json()) as Checkout[];
  await page.getByRole("button", { name: "주문 내역", exact: true }).click();
  await expect(page.locator("#orders-heading")).toBeVisible();
  return orders;
}
function orderId(orders: Checkout[], key: string) {
  const order = orders.find((item) => item.requestKey === key);
  if (!order) throw new Error(`${key} 대시보드 fixture가 필요합니다.`);
  return order.id;
}
async function open(page: Page, id: number) {
  await page.locator(`#btnOrderStatement-${id}`).click();
  await expect(page.locator("#statementOrderId")).toHaveText(`#${id}`);
  await expect(page.locator("#btnPrintStatement")).toBeEnabled();
}

test("내역서는 원본 금액·한국 시각을 표시하고 초점을 모달 안에 유지한다", async ({ page }) => {
  const orders = await login(page);
  const id = orderId(orders, "phase6-waiting");
  await open(page, id);
  await expect(page.locator("#statementConfirmedAt")).toHaveText("2026-10-13 09:10:00");
  await expect(page.locator("#statementTotalWon")).toHaveText("4,000원");
  const apple = page
    .locator(".statement-items-table tbody tr")
    .filter({ hasText: "대시보드 사과" });
  await expect(apple.locator(".item-qty-cell")).toHaveText("1");
  await expect(apple.locator(".item-price-cell")).toHaveText("1,000원");
  await expect(apple.locator(".item-subtotal-cell")).toHaveText("1,000원");
  await expect(page.locator("#statementTestNotice")).toContainText("모의 결제 테스트 내역");
  expect(await page.locator("dialog").evaluate((dialog) => dialog.matches(":modal"))).toBe(true);
  await page.locator("#btnRefreshOrders").evaluate((button: HTMLButtonElement) => button.focus());
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.locator("dialog").evaluate((dialog) => dialog.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".order-statement-modal")).toHaveCount(0);
  await expect(page.locator(`#btnOrderStatement-${id}`)).toBeFocused();
});

test("부분 취소·완료 환불은 원결제 총액과 구분된다", async ({ page }) => {
  const orders = await login(page);
  await open(page, orderId(orders, "phase6-partial"));
  await expect(page.locator("#statementTotalWon")).toHaveText("4,000원");
  await expect(page.locator("#statementRefundSummary")).toContainText("취소 1,000원");
  await expect(page.locator("#statementRefundSummary")).toContainText("환불 완료 1,000원");
  await expect(page.locator(".statement-item-cancelled")).toHaveCount(1);
  await expect(page.locator(".statement-refund-list")).toContainText("환불 완료");
});

test("전체 환불 후에도 원결제 금액과 취소 항목을 보존한다", async ({ page }) => {
  const orders = await login(page, "dashboard_buyer_c");
  await open(page, orderId(orders, "phase6-cancelled"));
  await expect(page.locator("#statementTotalWon")).toHaveText("1,000원");
  await expect(page.locator("#statementRefundSummary")).toContainText("취소 1,000원");
  await expect(page.locator("#statementRefundSummary")).toContainText("환불 완료 1,000원");
  await expect(page.locator(".statement-item-cancelled")).toHaveCount(1);
});

test("인쇄에는 선택한 내역서와 테스트 안내만 포함한다", async ({ page }) => {
  const orders = await login(page);
  await open(page, orderId(orders, "phase6-waiting"));
  await expect(page.locator('[id^="statementPickupCode-"]')).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = "yes";
    };
  });
  await page.locator("#btnPrintStatement").click();
  await expect(page.locator("body")).toHaveAttribute("data-print-requested", "yes");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#statement-dialog-title")).toBeVisible();
  await expect(page.locator("#statementTestNotice")).toBeVisible();
  await expect(page.locator("#statementTotalWon")).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.locator(".app-footer")).toBeHidden();
  await expect(page.locator("#orders-heading")).toBeHidden();
  await expect(page.locator("#btnPrintStatement")).toBeHidden();
  await expect(page.locator('[id^="statementPickupCode-"]')).toBeHidden();
  await page.pdf({ path: "../.local/verification/phase7-statement-print.pdf", format: "A4" });
});

test("재조회 실패는 기존 내역서를 폐기하고 재시도는 최신 서버 결과를 읽는다", async ({ page }) => {
  const orders = await login(page);
  await open(page, orderId(orders, "phase6-partial"));
  await page.route("**/api/buyer/orders/*/statement", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "내역서 조회 장애" }),
    });
  });
  await page.locator("#btnRefreshStatement").click();
  await expect(page.getByRole("alert")).toContainText("내역서 조회 장애");
  await expect(page.locator("#statementTotalWon")).toHaveCount(0);
  await expect(page.locator("#btnPrintStatement")).toBeDisabled();
  await page.unroute("**/api/buyer/orders/*/statement");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator("#statementRefundSummary")).toContainText("환불 완료 1,000원");
  await expect(page.locator("#btnPrintStatement")).toBeEnabled();
});

test("닫은 내역서의 늦은 401은 새 내역서와 세션을 변경하지 않는다", async ({ page }) => {
  const orders = await login(page);
  let arrived = () => {};
  let release = () => {};
  let finished = () => {};
  const requestArrived = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestFinished = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let first = true;
  await page.route("**/api/buyer/orders/*/statement", async (route) => {
    if (!first) {
      await route.continue();
      return;
    }
    first = false;
    arrived();
    await released;
    try {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "늦은 세션 만료" }),
      });
    } finally {
      finished();
    }
  });
  try {
    await page.locator(`#btnOrderStatement-${orderId(orders, "phase6-waiting")}`).click();
    await requestArrived;
    await page.locator("#btnCloseStatement").click();
    await open(page, orderId(orders, "phase6-partial"));
    release();
    await requestFinished;
    await expect(page.locator("#statementRefundSummary")).toContainText("환불 완료 1,000원");
    await expect(page.locator("#heading-login")).toHaveCount(0);
  } finally {
    release();
  }
});

test("현재 조회의 세션 만료는 주문·내역서·수령 코드를 폐기한다", async ({ page }) => {
  const orders = await login(page);
  await page.route("**/api/buyer/orders/*/statement", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "세션 만료" }),
    });
  });
  await page.locator(`#btnOrderStatement-${orderId(orders, "phase6-waiting")}`).click();
  await expect(page.locator("#heading-login")).toBeVisible();
  await expect(page.locator(".order-statement-modal")).toHaveCount(0);
  await expect(page.locator(".checkout-order")).toHaveCount(0);
  await expect(page.locator(".pickup-code-box")).toHaveCount(0);
});

test("390px 내역서는 페이지 가로 넘침 없이 조회·닫기를 제공한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const orders = await login(page);
  await open(page, orderId(orders, "phase6-partial"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "../.local/verification/phase7-statement-mobile.png",
    fullPage: true,
  });
  await page.locator("#btnCloseStatement").click();
  await expect(page.locator(".order-statement-modal")).toHaveCount(0);
});
