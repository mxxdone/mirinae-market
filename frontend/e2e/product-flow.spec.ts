import { expect, test, type Page } from "@playwright/test";
import { installTestClock } from "./fixedTime";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}을 설정해 주세요.`);
  return value;
}
async function login(page: Page, id: string) {
  await installTestClock(page);
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("판매자 kg 입력→오늘 공개→구매자 시장 검색·상세·타 시장 격리", async ({ page, browser }) => {
  const name = `양파 ${Date.now()} 3kg`;
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.locator("#heading-products")).toBeVisible();
  await page.locator("#productName").fill(name);
  await page.locator("#weightUnit").selectOption("kg");
  await page.locator("#productUnitAmount").fill("3");
  await page.locator("#productUnitAmount").fill("2.5");
  await page.locator("#weightUnit").selectOption("g");
  await expect(page.locator("#productUnitAmount")).toHaveValue("2500");
  await page.locator("#weightUnit").selectOption("kg");
  await expect(page.locator("#productUnitAmount")).toHaveValue("2.5");
  await page.locator("#productUnitAmount").fill("3");
  await page.locator("#productDescription").fill("한 포장 3kg, 오늘 매장 방문 수령");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByText("상품 정보가 저장되었습니다.", { exact: false })).toBeVisible();
  await page.locator("#orderDeadline").fill("14:00");
  await page.locator("#pickupStart").fill("15:00");
  await page.locator("#pickupEnd").fill("19:00");
  await page.getByRole("button", { name: "수령 시간 저장", exact: true }).click();
  await expect(page.getByText("매장 수령 시간이 저장되었습니다.", { exact: false })).toBeVisible();
  await page.locator("#offerPrice").fill("9000");
  await page.locator("#offerQuantity").fill("20");
  await page.getByRole("button", { name: "오늘 판매 시작", exact: true }).click();
  await expect(page.getByText("오늘 판매가 공개되었습니다.", { exact: false })).toBeVisible();
  await expect(page.getByText("100g당 300.00원", { exact: false })).toBeVisible();
  await expect(page.locator("#productName")).toBeDisabled();
  await expect(page.locator("#weightUnit")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#pickupStart")).toHaveValue("15:00");
  await expect(page.locator("#pickupEnd")).toHaveValue("19:00");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: "../output/playwright/phase3-seller-mobile.png", fullPage: true });
  const buyer = await browser.newContext();
  try {
    const buyerPage = await buyer.newPage();
    await login(buyerPage, required("E2E_BUYER_LOGIN_ID"));
    await buyerPage.getByRole("button", { name: "시장 상품 둘러보기" }).click();
    await buyerPage.locator("#marketSelect").selectOption({ label: "미리내시장" });
    await buyerPage.locator("#productSearch").fill(name);
    await buyerPage.getByRole("button", { name: "상품 검색", exact: true }).click();
    const card = buyerPage.locator(".offer-card").filter({ hasText: name });
    await expect(card).toContainText("9,000");
    await expect(card).toContainText("100g당 300.00원");
    await expect(card).toContainText("3,000g");
    await expect(card).toContainText("주문 14:00 마감");
    await buyerPage.screenshot({
      path: "../output/playwright/phase3-buyer-desktop.png",
      fullPage: true,
    });
    await card.getByRole("button", { name: /^상품 상세 보기/ }).click();
    await expect(buyerPage.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(buyerPage.locator(".offer-facts")).toContainText("15:00~19:00");
    await buyerPage.setViewportSize({ width: 390, height: 844 });
    await noOverflow(buyerPage);
    await buyerPage.screenshot({
      path: "../output/playwright/phase3-buyer-mobile.png",
      fullPage: true,
    });
    await buyerPage.locator("#marketSelect").selectOption({ label: "은하시장" });
    await expect(buyerPage.getByRole("heading", { name, exact: true })).toHaveCount(0);
    await buyerPage.locator("#productSearch").fill(name);
    await buyerPage.getByRole("button", { name: "상품 검색", exact: true }).click();
    await expect(buyerPage.locator(".offer-card")).toHaveCount(0);
    await expect(buyerPage.getByText("오늘 판매할 상품을 기다리고 있어요")).toBeVisible();
  } finally {
    await buyer.close();
  }
});

test("입력 실패·통신 실패를 성공으로 표시하지 않고 세션 만료 시 매장 상태를 폐기", async ({
  page,
  context,
}) => {
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.locator("#heading-products")).toBeVisible();
  await page.locator("#productName").fill(`실패검증${Date.now()}`);
  await page.locator("#productUnitAmount").fill("550");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("100g");
  await page.locator("#productUnitAmount").fill("500");
  await context.route("**/api/seller/stores/*/products", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("통신할 수 없습니다");
  await expect(page.locator(".market-success")).toHaveCount(0);
  await expect(page.locator("#productUnitAmount")).toHaveValue("500");
  await context.unroute("**/api/seller/stores/*/products");
  await context.clearCookies();
  await page.getByRole("button", { name: "상품 목록 새로고침" }).click();
  await expect(page.locator("#heading-login")).toBeVisible();
  await expect(page.locator("#heading-products")).toHaveCount(0);
  await expect(page.locator("#storeInfoName")).toHaveCount(0);
  await page.locator("#loginUserId").fill(required("E2E_SELLER_A_LOGIN_ID"));
  await page.locator("#loginPassword").fill(required("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-seller-store")).toBeVisible();
});

test("수령 시간 조회 실패 후 로딩을 끝내고 재조회로 복원", async ({ page, context }) => {
  await context.route("**/api/seller/stores/*/pickup-windows/*", async (route) => {
    if (route.request().method() === "GET") await route.abort("failed");
    else await route.continue();
  });
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.getByRole("alert")).toContainText("통신할 수 없습니다");
  await expect(page.getByText("저장된 시간을 확인하고 있습니다.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품 등록", exact: true })).toBeEnabled();
  await context.unroute("**/api/seller/stores/*/pickup-windows/*");
  await page.getByRole("alert").getByRole("button", { name: "다시 시도" }).click();
  await expect(page.locator("#pickupStart")).toHaveValue("15:00");
  await expect(page.getByText("저장된 수령 시간을 불러왔습니다.")).toBeVisible();
});

test("작성 중인 수령일을 자정 경계에서도 다른 날짜로 자동 변경해 전송하지 않음", async ({
  page,
}) => {
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await page.locator("#productName").fill(`날짜검증${Date.now()}`);
  await page.locator("#productUnitAmount").fill("100");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await page.locator("#offerPrice").fill("1000");
  await page.locator("#offerQuantity").fill("1");
  const label = await page
    .locator(".seller-products > .summary-tag-row .field-help-text")
    .innerText();
  const intendedDate = label.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  expect(intendedDate).toBeTruthy();
  await page.evaluate(() => {
    const NativeDate = Date;
    const now = NativeDate.now();
    let reads = 0;
    globalThis.Date = new Proxy(NativeDate, {
      construct(target, args, newTarget) {
        return Reflect.construct(
          target,
          args.length === 0 ? [reads++ === 0 ? now : now + 86400000] : args,
          newTarget,
        ) as Date;
      },
    });
  });
  const request = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().includes("/offers/"),
  );
  await page.getByRole("button", { name: "오늘 판매 시작", exact: true }).click();
  expect((await request).url()).toMatch(new RegExp(`/${intendedDate}$`));
  await expect(page.getByText("오늘 판매가 공개되었습니다.", { exact: false })).toBeVisible();
});

test("등록 상품 번호 이동·kg 복원·단건 삭제가 실제 API에 반영됨", async ({ page, context }) => {
  await login(page, required("E2E_SELLER_A_LOGIN_ID"));
  await expect(page.locator("#heading-products")).toBeVisible();
  const csrf = (await (await context.request.get("/api/auth/csrf")).json()) as {
    headerName: string;
    token: string;
  };
  const store = (await (await context.request.get("/api/seller/stores/me")).json()) as {
    id: number;
    marketId: number;
  };
  const prefix = `목록검증${Date.now()}`;
  const ids: number[] = [];
  for (let index = 0; index < 25; index++) {
    const response = await context.request.post(`/api/seller/stores/${store.id}/products`, {
      headers: { [csrf.headerName]: csrf.token },
      data: {
        name: `${prefix}-${index}`,
        description: "목록 검증",
        unitType: "WEIGHT",
        unitAmount: 2500,
      },
    });
    expect(response.status()).toBe(201);
    ids.push(((await response.json()) as { id: number }).id);
  }
  await page.getByRole("button", { name: "상품 목록 새로고침" }).click();
  const navigation = page.getByRole("navigation", { name: "등록 상품 페이지" });
  await navigation.getByRole("button", { name: "2페이지", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "2페이지", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await navigation.getByRole("button", { name: "1페이지", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "1페이지", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const listResponse = await context.request.get(
    `/api/seller/stores/${store.id}/products?page=0&size=100`,
  );
  const list = (await listResponse.json()) as {
    items: { id: number; name: string }[];
    totalItems: number;
  };
  const target = list.items.findIndex((item) => item.id === ids[24]);
  expect(target).toBeGreaterThanOrEqual(0);
  await navigation
    .getByRole("button", { name: `${Math.floor(target / 20) + 1}페이지`, exact: true })
    .click();
  await page
    .locator(".seller-product-choice")
    .filter({ hasText: `${prefix}-24` })
    .click();
  await expect(page.locator("#weightUnit")).toHaveValue("kg");
  await expect(page.locator("#productUnitAmount")).toHaveValue("2.5");
  await page.getByRole("button", { name: "상품 삭제", exact: true }).click();
  await expect(page.getByRole("group", { name: "상품 삭제 확인" })).toContainText(
    "판매 기록은 보존",
  );
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(page.getByText("상품이 삭제되었습니다.", { exact: false })).toBeVisible();
  const after = (await (
    await context.request.get(`/api/seller/stores/${store.id}/products?page=0&size=100`)
  ).json()) as { items: { id: number }[]; totalItems: number };
  expect(after.items.some((item) => item.id === ids[24])).toBe(false);
  expect(after.totalItems).toBe(list.totalItems - 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
});
