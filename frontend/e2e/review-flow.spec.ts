import { authenticatedApiHeaders } from "./authApi";
import { buyerHeaderAction } from "./buyerHeader";
import { expect, test, type Page } from "@playwright/test";
import type { Checkout } from "../src/api/checkout";
import type { ReviewEditor, ReviewSummary } from "../src/api/reviews";
import { installTestClock } from "./fixedTime";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 설정이 필요합니다.`);
  return value;
}
async function login(page: Page, id: string) {
  await page.goto("/");
  await page.locator("#loginUserId").fill(id);
  await page
    .locator("#loginPassword")
    .fill(env(id === env("E2E_ADMIN_LOGIN_ID") ? "E2E_ADMIN_PASSWORD" : "E2E_DEMO_PASSWORD"));
  await page.locator("#btnLoginSubmit").click();
  await expect(page.locator("#heading-login")).toHaveCount(0);
}
async function logout(page: Page, role: "buyer" | "seller" | "admin") {
  if (role === "buyer") await buyerHeaderAction(page, "로그아웃");
  else await page.locator(role === "seller" ? "#btnLogoutSeller" : "#btnAdminLogout").click();
  await expect(page.locator("#heading-login")).toBeVisible();
}

test("한 매장에서 계속 담기·구매자 리뷰·답글·삭제 요청·독립 삭제 복구", async ({ page }) => {
  test.setTimeout(120_000);
  await installTestClock(page);
  await login(page, "review_buyer");
  await page.locator("#buyerInputMarketName").fill("리뷰검증시장");
  await page.locator("#btnSearchMarketName").click();
  const market = await page
    .getByRole("button", { name: /리뷰검증시장/ })
    .getAttribute("data-market-id");
  if (!market) throw new Error("리뷰검증시장이 없습니다.");
  await page.locator(`button[data-market-id="${market}"]`).click();
  await page.locator("#tabMarketStores").click();
  await page.locator("#storeSearch").fill("리뷰검증");
  await page.locator("#btnSearchStore").click();
  await page.getByRole("button", { name: /매장 둘러보기.*리뷰검증매장/ }).click();
  await expect(page.locator("#heading-store-page")).toHaveText("리뷰검증매장");
  for (const name of ["리뷰 사과", "리뷰 배"]) {
    const card = page
      .locator(".offer-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card.getByRole("button", { name: "장바구니 담기", exact: true }).click();
    await expect(page.locator("#heading-store-page")).toBeVisible();
    await expect(page.locator("#btnStoreGoToCart")).toBeVisible();
  }
  await page.locator("#btnStoreGoToCart").click();
  await expect(page.locator(".checkout-item")).toHaveCount(2);
  await page.getByRole("button", { name: "통합 모의 결제", exact: true }).click();
  await expect(page.locator("#orders-heading")).toBeVisible();
  const response = await page.request.get("/api/buyer/orders", {
    headers: await authenticatedApiHeaders(page),
  });
  expect(response.status()).toBe(200);
  const orders = (await response.json()) as Checkout[];
  // 고정 시각 E2E에서는 전날 수령 완료 fixture를 사용한다. 실제 수령 전환은 HTTP integration·기존 수령 E2E가 검증한다.
  const order = orders.find((checkout) => checkout.requestKey === "review-picked-up")
    ?.storeOrders[0];
  if (!order || order.status !== "PICKED_UP")
    throw new Error("전날 수령 완료 리뷰 fixture가 없습니다.");
  const waiting = orders
    .flatMap((checkout) => checkout.storeOrders)
    .find((value) => value.storeName === "리뷰검증매장" && value.status === "WAITING");
  if (!waiting) throw new Error("새 구매의 수령 대기 주문이 없습니다.");
  await expect(
    page
      .locator(`[data-store-order-id="${waiting.id}"]`)
      .getByRole("button", { name: "리뷰 작성·관리" }),
  ).toHaveCount(0);
  const card = page.locator(`[data-store-order-id="${order.id}"]`);
  await card.getByRole("button", { name: "리뷰 작성·관리" }).click();
  await card.getByLabel("리뷰 내용").fill("신선하고 수령이 편했어요.");
  await card.getByRole("button", { name: "리뷰 저장", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("리뷰를 저장했습니다");
  await card.getByLabel("리뷰 별점").selectOption("4");
  await card.getByRole("button", { name: "리뷰 저장", exact: true }).click();
  const editorResponse = await page.request.get(`/api/buyer/store-orders/${order.id}/review`, {
    headers: await authenticatedApiHeaders(page),
  });
  const editor = (await editorResponse.json()) as ReviewEditor;
  const id = editor.review?.review.id;
  expect(id).toBeTruthy();
  await card.getByRole("button", { name: "리뷰 삭제", exact: true }).click();
  await card.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await card.getByRole("button", { name: "리뷰 복구", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("리뷰를 복구했습니다");
  await logout(page, "buyer");
  await login(page, "review_seller");
  await page.locator("#navSellerReviews").click();
  const sellerCard = page
    .locator(".review-management-card")
    .filter({ hasText: "신선하고 수령이 편했어요" });
  await sellerCard.getByRole("button", { name: /^답글 (작성|수정)$/ }).click();
  await sellerCard.getByLabel("판매자 답글").fill("찾아주셔서 감사합니다.");
  await sellerCard.getByRole("button", { name: "답글 저장", exact: true }).click();
  await expect(page.locator(".seller-reviews")).toContainText("답글을 저장했습니다");
  await sellerCard.getByRole("button", { name: "삭제 요청", exact: true }).click();
  await sellerCard.getByLabel("삭제 요청 사유").fill("리뷰 내용 확인 요청입니다.");
  await sellerCard.getByRole("button", { name: "삭제 요청 접수", exact: true }).click();
  await expect(sellerCard).toContainText("리뷰는 계속 공개됩니다");
  await logout(page, "seller");
  await login(page, "review_buyer");
  await page.goto(`/#market?market=${market}&store=${order.storeId}`);
  // 해시만 다른 URL로의 page.goto는 same-document 탐색이라 앱을 다시 부팅하지 않는다.
  // 그러면 로그인 직후 자동 선택된 시장(미리내시장)이 그대로 남아 딥링크가 적용되지 않는다.
  // 새 문서 로드(URL 직접 접근과 동일)로 진입해 저장된 위치를 실제로 복원시킨다.
  await page.reload();
  await expect(page.locator(".store-reviews")).toContainText("찾아주셔서 감사합니다");
  await expect(page.locator(".store-rating").first()).toContainText("매장 평점 ★ 4.0");
  await page.goto("/#orders");
  await card.getByRole("button", { name: "리뷰 작성·관리" }).click();
  await card.getByRole("button", { name: "리뷰 삭제", exact: true }).click();
  await card.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(card.getByRole("button", { name: "리뷰 복구", exact: true })).toBeVisible();
  await logout(page, "buyer");
  await login(page, env("E2E_ADMIN_LOGIN_ID"));
  await page.locator("#admin-nav-reviews").click();
  await page.getByRole("button", { name: "삭제 요청", exact: true }).click();
  const requestCard = page.locator(".review-management-card").filter({ hasText: "리뷰검증매장" });
  await requestCard.getByRole("button", { name: "삭제 승인", exact: true }).click();
  await requestCard.getByLabel("관리자 처리 사유").fill("내용을 확인하고 삭제 처리합니다.");
  await requestCard.getByRole("button", { name: "처리 확정", exact: true }).click();
  await expect(page.locator(".admin-review-panel")).toContainText("리뷰 처리를 완료했습니다");
  await page.getByRole("button", { name: "전체 리뷰", exact: true }).click();
  await requestCard.getByRole("button", { name: "관리자 삭제 해제", exact: true }).click();
  await requestCard.getByRole("button", { name: "처리 확정", exact: true }).click();
  await expect(requestCard.getByRole("button", { name: "관리자 삭제", exact: true })).toBeVisible();
  await logout(page, "admin");
  await login(page, "review_buyer");
  const summariesResponse = await page.request.get(
    `/api/markets/${market}/review-summaries?storeIds=${order.storeId}`,
    { headers: await authenticatedApiHeaders(page) },
  );
  const summaries = (await summariesResponse.json()) as ReviewSummary[];
  expect(summaries[0]?.reviewCount).toBe(0);
  await page.goto("/#orders");
  await card.getByRole("button", { name: "리뷰 작성·관리" }).click();
  await card.getByRole("button", { name: "리뷰 복구", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("리뷰를 복구했습니다");
  const restored = (await (
    await page.request.get(`/api/buyer/store-orders/${order.id}/review`, {
      headers: await authenticatedApiHeaders(page),
    })
  ).json()) as ReviewEditor;
  expect(restored.review?.review.id).toBe(id);
  await page.goto(`/#market?market=${market}&store=${order.storeId}`);
  // 해시만 다른 URL로의 page.goto는 same-document 탐색이라 앱을 다시 부팅하지 않는다.
  // 그러면 로그인 직후 자동 선택된 시장(미리내시장)이 남아 딥링크가 적용되지 않는다.
  // 새 문서 로드(URL 직접 접근과 동일)로 진입해 저장된 위치를 실제로 복원시킨다.
  await page.reload();
  await expect(page.locator(".store-reviews")).toContainText("찾아주셔서 감사합니다");
  await expect(page.locator(".toast-region")).toHaveCount(0);
  await page.screenshot({
    path: "../.local/verification/review-store-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../.local/verification/review-store-mobile.png", fullPage: true });
});
