import { useEffect, useState } from "react";
import { getReviewSummaries, type ReviewSummary } from "../api/reviews";
import { ApiError } from "../api/types";

export function useStoreRatings(
  marketId: number | null,
  ids: number[],
  onSessionExpired: () => void,
) {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");
  const target = `${marketId ?? ""}:${key}`;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ target: string; rows: ReviewSummary[]; failed: boolean }>({
    target: "",
    rows: [],
    failed: false,
  });
  useEffect(() => {
    if (marketId === null || !key) return;
    const controller = new AbortController();
    let active = true;
    void getReviewSummaries(marketId, key.split(",").map(Number), controller.signal)
      .then((rows) => {
        if (active) setState({ target, rows, failed: false });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else setState({ target, rows: [], failed: true });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [marketId, key, target, version, onSessionExpired]);
  const current = state.target === target;
  return {
    ratings: Object.fromEntries(
      (current ? state.rows : []).map((row) => [row.storeId, row]),
    ) as Record<number, ReviewSummary>,
    ratingLoading: !!key && !current,
    ratingError: current && state.failed,
    retryRatings: () => {
      setState({ target: "", rows: [], failed: false });
      setVersion((value) => value + 1);
    },
  };
}
