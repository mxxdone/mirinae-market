import { useEffect, useState } from "react";
import {
  getStoreReviews,
  type Review,
  type ReviewPage,
  type ReviewSummary,
} from "../../api/reviews";
import { ApiError } from "../../api/types";
import { Pagination } from "./Pagination";

export function StoreRating({
  summary,
  loading = false,
  failed = false,
}: {
  summary?: ReviewSummary;
  loading?: boolean;
  failed?: boolean;
}) {
  return (
    <p className="store-rating">
      {failed
        ? "매장 평점을 불러오지 못했습니다"
        : loading || !summary
          ? "매장 평점 확인 중…"
          : summary.reviewCount === 0
            ? "리뷰 없음"
            : `매장 평점 ★ ${summary.averageRating?.toFixed(1)} · 구매자 리뷰 ${summary.reviewCount.toLocaleString()}개`}
    </p>
  );
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="review-card">
      <div className="review-card-heading">
        <strong>★ {review.rating}</strong>
        <span className="pill-badge secondary">구매자 리뷰</span>
        <time dateTime={review.createdAt}>
          {new Date(review.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
        </time>
      </div>
      <p className="review-content">{review.content}</p>
      {review.reply && (
        <div className="review-reply">
          <strong>판매자 답글</strong>
          <p className="review-content">{review.reply.content}</p>
        </div>
      )}
    </article>
  );
}

export function StoreReviews({
  marketId,
  storeId,
  onSessionExpired,
}: {
  marketId: number;
  storeId: number;
  onSessionExpired: () => void;
}) {
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<ReviewPage<Review> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setResult(null);
    setError(null);
    void getStoreReviews(marketId, storeId, page, controller.signal)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else setError(failure instanceof Error ? failure.message : "리뷰를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [marketId, storeId, page, version, onSessionExpired]);
  return (
    <section className="store-reviews" aria-labelledby="storeReviewsHeading">
      <h3 id="storeReviewsHeading">
        구매자 리뷰{result ? ` (${result.totalItems.toLocaleString()})` : ""}
      </h3>
      <p className="field-help-text">이 매장에서 수령을 완료한 구매자가 남긴 매장 평가입니다.</p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setVersion((value) => value + 1)}>
            리뷰 다시 불러오기
          </button>
        </div>
      ) : !result ? (
        <p role="status">리뷰를 불러오고 있습니다.</p>
      ) : result.items.length === 0 ? (
        <p>아직 구매자 리뷰가 없습니다.</p>
      ) : (
        <>
          <div className="review-list">
            {result.items.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
          <Pagination
            label="구매자 리뷰 페이지"
            page={page}
            size={20}
            totalItems={result.totalItems}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
