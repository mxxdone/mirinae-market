import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { installTestClock } from "./fixedTime";
import { chooseBuyerMarket } from "./buyerMarket";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}
async function csrf(request: APIRequestContext) {
  const value = (await (await request.get("/api/auth/csrf")).json()) as {
    headerName: string;
    token: string;
  };
  return { [value.headerName]: value.token };
}
async function signApi(request: APIRequestContext, loginId: string, password: string) {
  expect(
    (
      await request.post("/api/auth/login", {
        headers: await csrf(request),
        form: { loginId, password },
      })
    ).status(),
  ).toBe(200);
  return csrf(request);
}
async function login(page: Page, loginId: string, password: string) {
  await page.goto("/");
  await page.locator("#loginUserId").fill(loginId);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#btnLoginSubmit").click();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("큰 작업 화면은 확장하고 적은 상품·폼·빈 결과는 읽기 폭을 유지한다", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await installTestClock(page);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  expect(
    await page
      .locator(".screen-container")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1040);
  await login(page, required("E2E_ADMIN_LOGIN_ID"), required("E2E_ADMIN_PASSWORD"));
  await expect(page.locator(".admin-workspace")).toBeVisible();
  await expect(page.locator(".admin-table-wrap tbody tr").first()).toBeVisible();
  const initialMarkets = (await (await page.request.get("/api/admin/markets")).json()) as {
    id: number;
  }[];
  await page.locator("#adminSearchQuery").fill("미리내시장");
  await expect(page.locator(".admin-table-wrap tbody tr")).toHaveCount(1);
  expect(
    await page
      .locator(".admin-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1920);
  await page.screenshot({
    path: "../output/playwright/responsive-admin-sparse-qhd.png",
    fullPage: true,
  });
  await page.locator("#adminSearchQuery").fill("없는결과_너비확인");
  await expect(page.locator(".admin-table-wrap tbody tr")).toHaveCount(0);
  expect(
    await page
      .locator(".admin-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1920);
  await page.locator("#adminSearchQuery").fill("");
  await expect(page.locator(".admin-table-wrap tbody tr")).toHaveCount(
    Math.min(initialMarkets.length, 50),
  );
  for (const width of [1280, 1920, 2560, 3440, 3840]) {
    await page.setViewportSize({ width, height: 1440 });
    expect(
      await page
        .locator(".admin-workspace")
        .evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThan(Math.min(width * 0.85, 1800));
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({ path: "../output/playwright/responsive-admin-qhd.png", fullPage: true });
  await page.locator("#admin-nav-stores").click();
  await page.locator("#btnAdminCreate").click();
  expect(
    await page
      .locator(".admin-detail")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(1200);
  for (const width of [320, 390, 768, 2560, 3840]) {
    await page.setViewportSize({ width, height: 1440 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({ path: "../output/playwright/responsive-form-qhd.png", fullPage: true });
  await page.locator("#btnAdminLogout").click();

  const suffix = Date.now().toString().slice(-9);
  const sellerId = `layout_${suffix}`;
  const firstPassword = "LayoutPass1234!";
  const password = "NewLayout1234!";
  const admin = await browser.newContext();
  const seller = await browser.newContext();
  let marketId: number;
  try {
    const headers = await signApi(
      admin.request,
      required("E2E_ADMIN_LOGIN_ID"),
      required("E2E_ADMIN_PASSWORD"),
    );
    const market = await admin.request.post("/api/admin/markets", {
      headers,
      data: {
        name: `화면시장_${suffix}`,
        regionCode: "11110",
        address: "서울특별시 종로구 창경궁로 88",
        latitude: 37.57,
        longitude: 127.0,
      },
    });
    expect(market.status()).toBe(201);
    marketId = ((await market.json()) as { id: number }).id;
    const store = await admin.request.post("/api/admin/stores", {
      headers,
      data: {
        marketId,
        name: `화면매장_${suffix}`,
        loginId: sellerId,
        password: firstPassword,
        email: `${sellerId}@example.com`,
        contactName: "김테스트",
        contactPhone: "01012345678",
      },
    });
    expect(store.status()).toBe(201);
    const storeId = ((await store.json()) as { id: number }).id;
    let sellerHeaders = await signApi(seller.request, sellerId, firstPassword);
    expect(
      (
        await seller.request.put("/api/seller/password", {
          headers: sellerHeaders,
          data: { currentPassword: firstPassword, newPassword: password },
        })
      ).status(),
    ).toBe(200);
    sellerHeaders = await csrf(seller.request);
    const date = required("E2E_FIXED_INSTANT").slice(0, 10);
    expect(
      (
        await seller.request.put(`/api/seller/stores/${storeId}/pickup-windows/${date}`, {
          headers: sellerHeaders,
          data: { orderDeadline: "14:00", startTime: "15:00", endTime: "19:00" },
        })
      ).status(),
    ).toBe(200);
    for (let index = 0; index < 12; index++) {
      const product = await seller.request.post(`/api/seller/stores/${storeId}/products`, {
        headers: sellerHeaders,
        data: {
          name: index === 0 ? `단일상품_${suffix}` : `화면상품_${suffix}_${index}`,
          description: "가변 너비 검증",
          unitType: "COUNT",
          unitAmount: 1,
        },
      });
      expect(product.status()).toBe(201);
      const productId = ((await product.json()) as { id: number }).id;
      expect(
        (
          await seller.request.put(
            `/api/seller/stores/${storeId}/products/${productId}/offers/${date}`,
            { headers: sellerHeaders, data: { priceWon: 1000, onlineQuantity: 10 } },
          )
        ).status(),
      ).toBe(200);
    }
  } finally {
    await admin.close();
    await seller.close();
  }

  await login(page, sellerId, password);
  await expect(page.locator(".sale-table-row")).toHaveCount(12);
  expect(
    await page
      .locator(".seller-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(1600);
  expect(
    await page
      .locator(".sale-table .input-box")
      .first()
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(192);
  expect(
    await page
      .locator(".seller-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1792);
  expect(
    await page
      .getByRole("button", { name: "변경 사항 적용", exact: true })
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(300);
  await page.screenshot({ path: "../output/playwright/responsive-sales-qhd.png", fullPage: true });
  await page.getByRole("button", { name: "상품 추가", exact: true }).click();
  expect(
    await page
      .locator(".seller-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1024);
  await page.locator("#btnLogoutSeller").click();

  await login(page, required("E2E_BUYER_LOGIN_ID"), required("E2E_DEMO_PASSWORD"));

  await chooseBuyerMarket(page, String(marketId));
  await expect(page.locator(".offer-card")).toHaveCount(12);
  const columns: number[] = [];
  for (const width of [1280, 2560, 3840]) {
    await page.setViewportSize({ width, height: 1440 });
    await noOverflow(page);
    const cardWidth = await page
      .locator(".offer-card")
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(cardWidth).toBeGreaterThanOrEqual(280);
    expect(cardWidth).toBeLessThan(420);
    columns.push(
      await page
        .locator(".offer-grid")
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
    );
  }
  expect(columns[1]).toBeGreaterThan(columns[0]!);
  expect(columns[2]).toBeGreaterThan(columns[1]!);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.screenshot({
    path: "../output/playwright/responsive-products-qhd.png",
    fullPage: true,
  });
  await page.locator("#productSearch").fill(`단일상품_${suffix}`);
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await expect(page.locator(".offer-card")).toHaveCount(1);
  expect(
    await page
      .locator(".market-workspace")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1152);
  expect(
    await page.locator(".offer-card").evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(420);
  await page.screenshot({
    path: "../output/playwright/responsive-single-product-qhd.png",
    fullPage: true,
  });
  await page.locator("#productSearch").fill(`빈결과_${suffix}`);
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await expect(page.locator("#buyerOfferEmpty")).toBeVisible();
  expect(
    await page
      .locator(".market-empty")
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(220);
  for (const width of [320, 390, 768, 2560, 3840]) {
    await page.setViewportSize({ width, height: 1440 });
    await noOverflow(page);
  }
});

test("한국어 문구는 단어 경계로 줄바꿈하고 관리자 이름은 두 줄로 표시한다", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  async function inspect(target: Page, label: string) {
    for (const width of [320, 390, 1280, 2560]) {
      await target.setViewportSize({ width, height: 900 });
      await noOverflow(target);
      const clipped = await target.locator("h1,h2,h3,h4,button,legend").evaluateAll((elements) =>
        elements
          .filter((element) => {
            if (element.closest(".sr-only, .sale-input-label")) return false;
            const rect = element.getBoundingClientRect();
            return (
              rect.width > 0 && rect.height > 0 && element.scrollWidth > element.clientWidth + 1
            );
          })
          .map((element) => element.textContent),
      );
      expect(clipped, `${label} ${width}px 글자 잘림`).toEqual([]);
      if (width === 390)
        await target.screenshot({
          path: `../output/playwright/text-wrap-${label}.png`,
          fullPage: true,
        });
    }
  }
  await installTestClock(page);
  await page.goto("/");
  await expect(page.locator("#heading-login")).toBeVisible();
  await inspect(page, "로그인");
  await page.getByRole("button", { name: "구매자 회원가입하기" }).click();
  await expect(page.locator("#heading-signup")).toBeVisible();
  await inspect(page, "회원가입");

  for (const role of ["ADMIN", "BUYER", "SELLER"] as const) {
    const context = await browser.newContext();
    try {
      const target = await context.newPage();
      await installTestClock(target);
      const loginId = required(
        role === "ADMIN"
          ? "E2E_ADMIN_LOGIN_ID"
          : role === "BUYER"
            ? "E2E_BUYER_LOGIN_ID"
            : "E2E_SELLER_A_LOGIN_ID",
      );
      await login(
        target,
        loginId,
        required(role === "ADMIN" ? "E2E_ADMIN_PASSWORD" : "E2E_DEMO_PASSWORD"),
      );
      await expect(
        target.locator(
          `.screen-container[data-screen="${role === "ADMIN" ? "admin" : role === "BUYER" ? "buyer-market" : "seller-store"}"]`,
        ),
      ).toBeVisible();
      if (role === "SELLER")
        await expect(
          target.getByText("상품 목록을 불러오는 중입니다.", { exact: true }),
        ).toHaveCount(0);
      await inspect(target, role);
      if (role === "ADMIN") {
        for (const width of [320, 390, 1280, 2560]) {
          await target.setViewportSize({ width, height: 900 });
          const lines = await target.locator(".admin-brand-row h1 span").evaluateAll((elements) =>
            elements.map((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return {
                top: element.getBoundingClientRect().top,
                lines: range.getClientRects().length,
                text: element.textContent,
              };
            }),
          );
          expect(lines.map((value) => value.text)).toEqual(["미리내 마켓", "관리자"]);
          expect(lines.every((value) => value.lines === 1)).toBe(true);
          expect(lines[1]?.top).toBeGreaterThan(lines[0]?.top ?? 0);
        }
        await target.setViewportSize({ width: 390, height: 844 });
        await target.locator("#btnAdminCreate").click();
        await expect(target.locator("#adminCandidateProvince")).toBeVisible();
        const province = await target.locator("#adminCandidateProvince").boundingBox();
        const district = await target.locator("#adminCandidateRegion").boundingBox();
        expect(district?.y).toBeGreaterThan(province?.y ?? 0);
        await target.screenshot({
          path: "../output/playwright/text-wrap-admin-mobile.png",
          fullPage: true,
        });
      }
      if (role === "BUYER") {
        await expect(target.locator(".market-workspace")).toBeVisible();
        await inspect(target, "구매자 시장 선택");
        await target.setViewportSize({ width: 390, height: 844 });
        await target.screenshot({
          path: "../output/playwright/text-wrap-buyer-mobile.png",
          fullPage: true,
        });
      }
      if (role === "SELLER") {
        await target.setViewportSize({ width: 390, height: 844 });
        await target.screenshot({
          path: "../output/playwright/text-wrap-seller-mobile.png",
          fullPage: true,
        });
      }
    } finally {
      await context.close();
    }
  }
});
