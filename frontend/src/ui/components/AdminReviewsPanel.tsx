import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  adminDeleteReview,
  adminRestoreReview,
  decideReviewDeletion,
  getAdminReviews,
  getReviewDeletionRequests,
  type AdminReview,
  type ReviewDeletionRequest,
  type ReviewPage,
} from "../../api/reviews";
import { ApiError } from "../../api/types";
import { Pagination } from "./Pagination";

function ModerationActions({
  item,
  onChanged,
  onSessionExpired,
}: {
  item: AdminReview | ReviewDeletionRequest;
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const [action, setAction] = useState<"delete" | "restore" | "approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const alive = useRef(true),
    mutation = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function choose(value: typeof action) {
    setAction(value === action ? null : value);
    setReason("");
    setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || mutation.current) return;
    const text = reason.trim();
    if (action !== "restore" && (!text || Array.from(text).length > 500)) {
      setError("처리 사유는 1~500자로 입력해 주세요.");
      return;
    }
    mutation.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "restore") await adminRestoreReview(item.id);
      else if (action === "delete") await adminDeleteReview(item.id, text);
      else await decideReviewDeletion(item.id, action === "approve", text);
      if (alive.current) onChanged();
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(failure instanceof Error ? failure.message : "리뷰를 처리하지 못했습니다.");
    } finally {
      mutation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="review-actions">
        {"reviewId" in item ? (
          <>
            <button type="button" disabled={busy} onClick={() => choose("approve")}>
              삭제 승인
            </button>
            <button type="button" disabled={busy} onClick={() => choose("reject")}>
              요청 반려
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => choose(item.adminDeleted ? "restore" : "delete")}
          >
            {item.adminDeleted ? "관리자 삭제 해제" : "관리자 삭제"}
          </button>
        )}
      </div>
      {action && (
        <form
          className="review-editor-panel"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {action === "restore" ? (
            <p>관리자 삭제를 해제하시겠습니까? 작성자의 삭제는 그대로 유지됩니다.</p>
          ) : (
            <label>
              관리자 처리 사유
              <textarea
                required
                rows={3}
                maxLength={1000}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="review-actions">
            <button type="submit" disabled={busy}>
              {busy ? "처리 중…" : "처리 확정"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAction(null)}>
              닫기
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function AdminReviewsPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [mode, setMode] = useState<"reviews" | "requests">("reviews");
  const [page, setPage] = useState(0),
    [version, setVersion] = useState(0);
  const [data, setData] = useState<ReviewPage<AdminReview | ReviewDeletionRequest> | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null);
    setError(null);
    const pending =
      mode === "reviews"
        ? getAdminReviews(page, controller.signal)
        : getReviewDeletionRequests(page, controller.signal);
    void pending
      .then((value) => {
        if (active) setData(value);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else
          setError(
            failure instanceof Error ? failure.message : "리뷰 관리 정보를 불러오지 못했습니다.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, page, version, onSessionExpired]);
  return (
    <main className="admin-content admin-review-panel">
      <h2>리뷰 관리</h2>
      <div className="review-actions">
        <button
          type="button"
          aria-pressed={mode === "reviews"}
          onClick={() => {
            setMode("reviews");
            setPage(0);
          }}
        >
          전체 리뷰
        </button>
        <button
          type="button"
          aria-pressed={mode === "requests"}
          onClick={() => {
            setMode("requests");
            setPage(0);
          }}
        >
          삭제 요청
        </button>
      </div>
      {notice && <p role="status">리뷰 처리를 완료했습니다.</p>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setVersion((value) => value + 1)}>
            다시 불러오기
          </button>
        </div>
      ) : !data ? (
        <p role="status">리뷰 관리 정보를 불러오고 있습니다.</p>
      ) : (
        <>
          {data.items.length === 0 ? (
            <p>{mode === "reviews" ? "등록된 리뷰가 없습니다." : "미처리 삭제 요청이 없습니다."}</p>
          ) : (
            data.items.map((item) => (
              <article className="review-management-card" key={`${mode}-${item.id}`}>
                <h3>
                  {item.storeName} · 리뷰 {"reviewId" in item ? item.reviewId : item.id}
                </h3>
                <p>★ {item.rating} · 구매자 리뷰</p>
                <p className="review-content">{item.content}</p>
                {"reviewId" in item ? (
                  <p className="review-content">판매자 삭제 요청 사유: {item.reason}</p>
                ) : (
                  <p>
                    {item.authorDeleted ? "작성자 삭제" : "작성자 삭제 없음"} ·{" "}
                    {item.adminDeleted ? "관리자 삭제: " + item.adminReason : "관리자 삭제 없음"}
                  </p>
                )}
                <ModerationActions
                  item={item}
                  onSessionExpired={onSessionExpired}
                  onChanged={() => {
                    setNotice(true);
                    setVersion((value) => value + 1);
                  }}
                />
              </article>
            ))
          )}
          <Pagination
            label="리뷰 운영 페이지"
            page={page}
            size={20}
            totalItems={data.totalItems}
            onPage={setPage}
          />
        </>
      )}
    </main>
  );
}
