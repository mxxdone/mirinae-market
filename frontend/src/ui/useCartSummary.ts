import { useCallback, useEffect, useState } from "react";
import { getCart, type Cart } from "../api/checkout";
import { ApiError, type UserMe } from "../api/types";

export function useCartSummary(user: UserMe | null, onSessionExpired: () => void) {
  const userId = user?.role === "BUYER" ? user.id : null;
  const [summary, setSummary] = useState<{ userId: number | null; version: number; count: number }>(
    { userId: null, version: -1, count: 0 },
  );
  const onCartChanged = useCallback(
    (cart: Cart) => {
      setSummary((previous) =>
        previous.userId === userId && previous.version >= cart.version
          ? previous
          : { userId, version: cart.version, count: cart.items.length },
      );
    },
    [userId],
  );
  useEffect(() => {
    if (userId === null) {
      setSummary({ userId: null, version: -1, count: 0 });
      return;
    }
    let active = true;
    void getCart()
      .then((cart) => {
        if (active) onCartChanged(cart);
      })
      .catch((failure: unknown) => {
        if (active && failure instanceof ApiError && failure.status === 401) onSessionExpired();
      });
    return () => {
      active = false;
    };
  }, [userId, onCartChanged, onSessionExpired]);
  return {
    cartCount: userId !== null && summary.userId === userId ? summary.count : null,
    onCartChanged,
  };
}
