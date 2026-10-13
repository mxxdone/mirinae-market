export type SellerPage = "sales" | "store";

export function isSellerLocation(): boolean {
  return window.location.hash === "#seller" || window.location.hash === "#seller/store";
}

export function readSellerPage(): SellerPage {
  return window.location.hash === "#seller/store" ? "store" : "sales";
}

export function writeSellerPage(page: SellerPage, push = true): void {
  const hash = page === "store" ? "#seller/store" : "#seller";
  if (window.location.hash === hash) return;
  if (push) window.history.pushState(null, "", hash);
  else window.history.replaceState(null, "", hash);
}
