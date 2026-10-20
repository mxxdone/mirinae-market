export type SellerPage = "sales" | "store" | "orders" | "dashboard";

export function isSellerLocation(): boolean {
  return (
    window.location.hash === "#seller" ||
    window.location.hash === "#seller/orders" ||
    window.location.hash === "#seller/dashboard" ||
    window.location.hash === "#seller/store" ||
    /^#seller\/product\/(new|[1-9]\d*)$/.test(window.location.hash)
  );
}

export function readSellerPage(hash = window.location.hash): SellerPage {
  if (hash === "#seller/dashboard") return "dashboard";
  if (hash === "#seller/orders") return "orders";
  return hash === "#seller/store" ? "store" : "sales";
}

export function readProductPage(hash: string): number | "new" | null {
  if (hash === "#seller/product/new") return "new";
  const match = hash.match(/^#seller\/product\/([1-9]\d*)$/);
  const id = match ? Number(match[1]) : null;
  return id !== null && Number.isSafeInteger(id) ? id : null;
}

export function writeProductPage(id: number | "new" | null): void {
  const hash = id === null ? "#seller" : `#seller/product/${id}`;
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
}

export function writeSellerPage(page: SellerPage, push = true): void {
  const hash =
    page === "dashboard"
      ? "#seller/dashboard"
      : page === "store"
        ? "#seller/store"
        : page === "orders"
          ? "#seller/orders"
          : "#seller";
  if (window.location.hash === hash) return;
  if (push) window.history.pushState(null, "", hash);
  else window.history.replaceState(null, "", hash);
}
