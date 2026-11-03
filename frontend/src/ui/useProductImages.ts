import { useEffect, useState } from "react";
import { getPublicProductImages, type ProductImage } from "../api/productImages";
import { ApiError } from "../api/types";

export function useProductImages(
  market: number | null,
  ids: number[],
  onSessionExpired: () => void,
) {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");
  const target = `${market}:${key}`;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    target: string;
    images: Record<number, ProductImage>;
    failed: boolean;
  }>({ target: "", images: {}, failed: false });
  useEffect(() => {
    if (market === null || !key) return;
    const controller = new AbortController();
    let active = true;
    void getPublicProductImages(market, key.split(",").map(Number), controller.signal)
      .then((rows) => {
        if (active)
          setState({
            target,
            images: Object.fromEntries(rows.map((row) => [row.productId, row.image])),
            failed: false,
          });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else setState({ target, images: {}, failed: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [market, key, target, version, onSessionExpired]);
  return {
    images: state.target === target ? state.images : {},
    failed: !!key && state.target === target && state.failed,
    retry: () => setVersion((value) => value + 1),
  };
}
