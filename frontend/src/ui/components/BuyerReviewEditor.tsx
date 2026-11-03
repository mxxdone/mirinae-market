import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteReview,
  getReviewEditor,
  restoreReview,
  saveReview,
  type ReviewEditor,
} from "../../api/reviews";
import { ApiError } from "../../api/types";

export function BuyerReviewEditor({
  orderId,
  onSessionExpired,
}: {
  orderId: number;
  onSessionExpired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState<ReviewEditor | null>(null);
  const [rating, setRating] = useState("5");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mounted = useRef(true);
  const mutating = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    setEditor(null);
    setError(null);
    setNotice(null);
    void getReviewEditor(orderId, controller.signal)
      .then((value) => {
        if (!active) return;
        setEditor(value);
        setRating(String(value.review?.review.rating ?? 5));
        setContent(value.review?.review.content ?? "");
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else
          setError(failure instanceof Error ? failure.message : "리뷰 정보를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, orderId, version, onSessionExpired]);
  async function mutate(action: "save" | "delete" | "restore") {
    if (mutating.current) return;
    if (action === "save" && (!content.trim() || Array.from(content.trim()).length > 1000)) {
      setError("리뷰 내용은 1~1,000자로 입력해 주세요.");
      return;
    }
    mutating.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "delete") {
        await deleteReview(orderId);
        if (mounted.current) {
          setEditor((value) =>
            value?.review ? { ...value, review: { ...value.review, authorDeleted: true } } : value,
          );
          setConfirmDelete(false);
        }
      } else {
        const value =
          action === "save"
            ? await saveReview(orderId, Number(rating), content.trim())
            : await restoreReview(orderId);
        if (mounted.current) setEditor(value);
      }
      if (mounted.current)
        setNotice(
          action === "delete"
            ? "리뷰를 삭제했습니다. 같은 리뷰를 복구할 수 있습니다."
            : action === "restore"
              ? "리뷰를 복구했습니다."
              : "리뷰를 저장했습니다.",
        );
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
      else setError(failure instanceof Error ? failure.message : "리뷰를 처리하지 못했습니다.");
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const hidden = editor?.review?.authorDeleted || editor?.review?.adminDeleted;
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate("save");
  }
  return (
    <div className="buyer-review-editor">
      <button
        type="button"
        disabled={busy}
        aria-expanded={open}
        aria-controls={`orderReview-${orderId}`}
        onClick={() => setOpen((value) => !value)}
      >
        리뷰 작성·관리
      </button>
      {open && (
        <section
          id={`orderReview-${orderId}`}
          className="review-editor-panel"
          aria-label="본인 구매자 리뷰"
        >
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {!editor ? (
            <>
              <p>{error ? "연결 상태를 확인해 주세요." : "리뷰 정보를 불러오고 있습니다."}</p>
              {error && (
                <button type="button" onClick={() => setVersion((value) => value + 1)}>
                  리뷰 다시 불러오기
                </button>
              )}
            </>
          ) : editor.review?.adminDeleted ? (
            <div>
              <p>관리자가 삭제한 리뷰입니다. 관리자만 삭제를 해제할 수 있습니다.</p>
              {editor.review.authorDeleted ? (
                <p>본인 삭제도 적용되어 있어 관리자 삭제를 해제해도 공개되지 않습니다.</p>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete((value) => !value)}
                  >
                    내 리뷰도 삭제
                  </button>
                  {confirmDelete && (
                    <div>
                      <p>
                        관리자 삭제가 해제돼도 비공개로 유지하도록 본인 리뷰를 삭제하시겠습니까?
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void mutate("delete");
                        }}
                      >
                        삭제 확인
                      </button>
                      <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                        삭제 취소
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : editor.review?.authorDeleted ? (
            <>
              <p>본인이 삭제한 리뷰입니다.</p>
              <p className="review-content">{editor.review.review.content}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void mutate("restore");
                }}
              >
                리뷰 복구
              </button>
            </>
          ) : !editor.review && !editor.canCreate ? (
            <p>리뷰 신규 작성 기한이 지났습니다. 수령 완료 후 30일 이내에 작성할 수 있습니다.</p>
          ) : (
            <form onSubmit={submit}>
              <p className="field-help-text">
                수령 완료한 매장 주문의 구매자 리뷰입니다. 신규 작성은 수령 완료 후 30일 이내에
                가능합니다.
              </p>
              <label>
                리뷰 별점
                <select
                  value={rating}
                  disabled={busy}
                  onChange={(event) => setRating(event.target.value)}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value}점
                    </option>
                  ))}
                </select>
              </label>
              <label>
                리뷰 내용
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={content}
                  disabled={busy}
                  onChange={(event) => setContent(event.target.value)}
                />
              </label>
              <div className="review-actions">
                <button type="submit" disabled={busy}>
                  {busy ? "처리 중…" : "리뷰 저장"}
                </button>
                {editor.review && !hidden && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete((value) => !value)}
                  >
                    리뷰 삭제
                  </button>
                )}
              </div>
              {confirmDelete && (
                <div>
                  <p>리뷰를 삭제하시겠습니까? 삭제하면 평점에서도 제외됩니다.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void mutate("delete");
                    }}
                  >
                    삭제 확인
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    삭제 취소
                  </button>
                </div>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
