import { expect, type Page } from "@playwright/test";

export async function openBuyerAccountMenu(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: "계정 메뉴", exact: true });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

export async function buyerHeaderAction(
  page: Page,
  name: "내 계정" | "주문 내역" | "로그아웃",
): Promise<void> {
  await openBuyerAccountMenu(page);
  await page.locator("#buyer-account-menu").getByRole("button", { name, exact: true }).click();
}
