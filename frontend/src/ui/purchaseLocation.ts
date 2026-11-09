export interface DirectPurchaseLocation {
  marketId: number;
  offerId: number;
  quantity: number;
}

export function readDirectPurchaseLocation(
  hash = window.location.hash,
): DirectPurchaseLocation | null {
  if (!hash.startsWith("#buy?")) return null;
  const params = new URLSearchParams(hash.slice(5));
  const values = ["market", "offer", "quantity"].map((key) => params.get(key));
  if (values.some((value) => !value || !/^[1-9][0-9]*$/.test(value))) return null;
  const [marketId, offerId, quantity] = values.map(Number);
  if (
    !marketId ||
    !offerId ||
    !quantity ||
    ![marketId, offerId, quantity].every(Number.isSafeInteger) ||
    quantity > 2147483647
  )
    return null;
  return { marketId, offerId, quantity };
}
