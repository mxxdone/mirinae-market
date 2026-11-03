import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getSellerReviews,
  requestReviewDeletion,
  saveReviewReply,
  type ReviewPage,
  type SellerReview,
} from "../../api/reviews";
import { ApiError } from "../../api/types";
import { Pagination } from "./Pagination";
import { ReviewCard, StoreRating } from "./StoreReviews";

function SellerReviewActions({
  storeId,
  item,
  onChanged,
  onSessionExpired,
}: {
  storeId: number;
  item: SellerReview;
  onChanged: (message: string) => void;
  onSessionExpired: () => void;
}) {
  const [mode, setMode] = useState<"reply" | "request" | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const mutation = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function choose(next: "reply" | "request") {
    setMode(mode === next ? null : next);
    setError(null);
    setContent(next === "reply" ? (item.review.reply?.content ?? "") : "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || mutation.current) return;
    const text = content.trim(),
      limit = mode === "reply" ? 1000 : 500;
    if (!text || Array.from(text).length > limit) {
      setError(`내용은 1~${limit}자로 입력해 주세요.`);
      return;
    }
    mutation.current = true;
    setBusy(true);
    setError(null);
    try {
      if (mode === "reply") await saveReviewReply(storeId, item.review.id, text);
      else await requestReviewDeletion(storeId, item.review.id, text);
      if (alive.current)
        onChanged(
          mode === "reply"
            ? "답글을 저장했습니다."
            : "삭제 요청을 접수했습니다. 관리자 처리 전까지 리뷰는 공개됩니다.",
        );
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(failure instanceof Error ? failure.message : "처리하지 못했습니다.");
    } finally {
      mutation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="review-management-card">
      <ReviewCard review={item.review} />
      <div className="review-actions">
        <button
          type="button"
          disabled={busy}
          aria-expanded={mode === "reply"}
          onClick={() => choose("reply")}
        >
          {item.review.reply ? "답글 수정" : "답글 작성"}
        </button>
        <button
          type="button"
          disabled={busy || item.deletionRequested}
          aria-expanded={mode === "request"}
          onClick={() => choose("request")}
        >
          삭제 요청
        </button>
      </div>
      {item.deletionRequested && (
        <p className="field-help-text">삭제 요청 검토 중입니다. 리뷰는 계속 공개됩니다.</p>
      )}
      {mode && (
        <form
          className="review-editor-panel"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            {mode === "reply" ? "판매자 답글" : "삭제 요청 사유"}
            <textarea
              required
              rows={3}
              maxLength={2000}
              disabled={busy}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="review-actions">
            <button type="submit" disabled={busy}>
              {busy ? "처리 중…" : mode === "reply" ? "답글 저장" : "삭제 요청 접수"}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(null)}>
              닫기
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function SellerReviewsPanel({
  storeId,
  onSessionExpired,
}: {
  storeId: number;
  onSessionExpired: () => void;
}) {
  const [page, setPage] = useState(0),
    [version, setVersion] = useState(0);
  const [data, setData] = useState<ReviewPage<SellerReview> | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null);
    setError(null);
    void getSellerReviews(storeId, page, controller.signal)
      .then((value) => {
        if (active) setData(value);
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
  }, [storeId, page, version, onSessionExpired]);
  return (
    <section className="seller-reviews" aria-label="매장 리뷰 관리">
      <h2>매장 리뷰</h2>
      <p>구매자 리뷰에 답글을 남기거나 관리자에게 삭제 검토를 요청할 수 있습니다.</p>
      {notice && <p role="status">{notice}</p>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setVersion((value) => value + 1)}>
            다시 불러오기
          </button>
        </div>
      ) : !data ? (
        <p role="status">리뷰를 불러오고 있습니다.</p>
      ) : (
        <>
          <StoreRating summary={data.summary ?? undefined} />
          {data.items.length === 0 ? (
            <p>공개된 구매자 리뷰가 없습니다.</p>
          ) : (
            data.items.map((item) => (
              <SellerReviewActions
                key={item.review.id}
                storeId={storeId}
                item={item}
                onSessionExpired={onSessionExpired}
                onChanged={(message) => {
                  setNotice(message);
                  setVersion((value) => value + 1);
                }}
              />
            ))
          )}
          <Pagination
            label="매장 리뷰 관리 페이지"
            page={page}
            size={20}
            totalItems={data.totalItems}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
