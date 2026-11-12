import { authenticatedApiHeaders } from "./authApi";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { installTestClock } from "./fixedTime";
import { chooseBuyerMarket } from "./buyerMarket";
import type { ProductImage } from "../src/api/productImages";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}
async function login(page: Page, id: string) {
  await installTestClock(page);
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page.locator("#loginPassword").fill(env("E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-login")).toHaveCount(0);
}
async function photo(name: "apple" | "strawberry") {
  const folder = process.env.E2E_SAMPLE_IMAGE_DIR;
  if (folder)
    return {
      name: `${name}.jpg`,
      mimeType: "image/jpeg",
      buffer: await readFile(join(folder, `${name}.jpg`)),
    };
  return {
    name: `${name}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64",
    ),
  };
}
async function loaded(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element) => {
        const image = element as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

async function saveImageChange(page: Page) {
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "PUT" && /\/products\/\d+$/.test(new URL(value.url()).pathname),
  );
  await page.getByRole("button", { name: "상품 정보 저장", exact: true }).click();
  expect((await response).status()).toBe(200);
}

test("사진 선택 등록·교체·제거와 카드/리스트/상세·기본 SVG가 실제 저장소에 연결된다", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const prefix = `사진검증 ${Date.now()}`;
  const firstName = `${prefix} 사과`,
    secondName = `${prefix} 딸기`;
  await login(page, env("E2E_SELLER_A_LOGIN_ID"));
  const store = (
    (await (
      await page.request.get("/api/seller/stores/me", {
        headers: await authenticatedApiHeaders(page),
      })
    ).json()) as { id: number }
  ).id;
  const products: number[] = [];
  for (const [name, image] of [
    [firstName, "apple"],
    [secondName, "strawberry"],
  ] as const) {
    await page.getByRole("button", { name: "상품 추가", exact: true }).click();
    await page.locator("#productName").fill(name);
    await page.locator("#productUnitType").selectOption("COUNT");
    await page.locator("#productUnitAmount").fill("1");
    await page.locator("#productPhoto").setInputFiles(await photo(image));
    await loaded(page, ".product-image-editor img");
    const response = page.waitForResponse(
      (value) =>
        value.request().method() === "POST" && new URL(value.url()).pathname.endsWith("/products"),
    );
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    const saved = await response;
    expect(saved.status()).toBe(201);
    products.push(((await saved.json()) as { id: number }).id);
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("checkbox").check();
    await row.getByRole("textbox").nth(0).fill("3500");
    await row.getByRole("textbox").nth(1).fill("10");
    await page.locator("#orderDeadline").fill("13:00");
    await page.locator("#pickupStart").fill("14:00");
    await page.locator("#pickupEnd").fill("18:00");
    await page.getByRole("button", { name: "변경 사항 적용", exact: true }).click();
    await expect(row.locator(".sale-status-cell > span")).toHaveText("판매 중");
  }
  const imagePath = `/api/seller/stores/${store}/products/${products[0]!}/image`;
  const imageHeaders = await authenticatedApiHeaders(page);
  const original = (await (
    await page.request.get(imagePath, { headers: imageHeaders })
  ).json()) as {
    image: ProductImage;
  };
  const context = await browser.newContext();
  try {
    const buyer = await context.newPage();
    await login(buyer, env("E2E_BUYER_LOGIN_ID"));
    await chooseBuyerMarket(buyer, { label: "미리내시장 (위치 미등록)" });
    await buyer.locator("#productSearch").fill(prefix);
    await buyer.getByRole("button", { name: "상품 검색", exact: true }).click();
    await expect(buyer.locator(".offer-card")).toHaveCount(2);
    await loaded(buyer, ".offer-card:first-child .product-photo img");
    await expect(buyer.locator(".offer-card:first-child img")).toHaveAttribute(
      "src",
      new RegExp(original.image.id),
    );
    await buyer.setViewportSize({ width: 1920, height: 1080 });
    await expect(buyer.getByRole("button", { name: "카드형", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await buyer.getByRole("button", { name: "리스트형", exact: true }).click();
    await buyer.screenshot({ path: "../.local/verification/product-images-list.png" });
    await buyer.getByRole("button", { name: "카드형", exact: true }).click();
    await loaded(buyer, ".offer-card:first-child .product-photo img");
    await loaded(buyer, ".offer-card:nth-child(2) .product-photo img");
    await buyer.screenshot({ path: "../.local/verification/product-images-grid.png" });
    await buyer.locator(".offer-card").first().locator(".offer-product-name").click();
    await loaded(buyer, ".product-photo--detail img");
    await buyer.screenshot({ path: "../.local/verification/product-images-detail.png" });
    const row = page.getByRole("row").filter({ hasText: firstName });
    if ((await row.count()) === 0) {
      await page
        .getByRole("navigation", { name: "등록 상품 페이지" })
        .getByRole("button", { name: "이전 페이지", exact: true })
        .click();
    }
    await row.getByRole("button", { name: `${firstName} 상품 수정`, exact: true }).click();
    await expect(page.locator("#productName")).toBeDisabled();
    await page.locator("#productPhoto").setInputFiles(await photo("strawberry"));
    await saveImageChange(page);
    await expect(row).toBeVisible();
    const replaced = (await (
      await page.request.get(imagePath, { headers: imageHeaders })
    ).json()) as {
      image: ProductImage;
    };
    expect(replaced.image.id).not.toBe(original.image.id);
    await buyer.reload();
    await expect(buyer.locator(".product-photo--detail img")).toHaveAttribute(
      "src",
      new RegExp(replaced.image.id),
    );
    await row.getByRole("button", { name: `${firstName} 상품 수정`, exact: true }).click();
    await page.getByRole("button", { name: "사진 제거", exact: true }).click();
    await saveImageChange(page);
    await expect(row).toBeVisible();
    await buyer.reload();
    await expect(buyer.locator(".product-photo--detail img")).toHaveAttribute(
      "src",
      "/images/product-placeholder.svg",
    );
    await loaded(buyer, ".product-photo--detail img");
    await buyer.setViewportSize({ width: 390, height: 844 });
    expect(await buyer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await buyer.screenshot({ path: "../.local/verification/product-images-default-mobile.png" });
    await row.getByRole("button", { name: `${firstName} 상품 수정`, exact: true }).click();
    await page.locator("#productPhoto").setInputFiles(await photo("apple"));
    await saveImageChange(page);
    await expect(row).toBeVisible();
  } finally {
    await context.close();
  }
});
