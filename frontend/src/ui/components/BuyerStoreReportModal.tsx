import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import {
  formatReportStatus,
  formatReportType,
  getStoreReports,
  reportStore,
  updateStoreReport,
  deleteStoreReport,
  type ReportType,
  type StoreReportView,
} from "../../api/operations";
import { ApiError } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface Props {
  storeId: number;
  storeName: string;
  onClose: () => void;
  onSessionExpired: () => void;
}

export function BuyerStoreReportModal({
  storeId,
  storeName,
  onClose,
  onSessionExpired,
}: Props): ReactElement {
  const [type, setType] = useState<ReportType>("CLOSURE_SUSPECTED");
  const [description, setDescription] = useState("");
  const [reports, setReports] = useState<StoreReportView[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreReportView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const mounted = useRef(true);
  const mutation = useRef(false);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const reportsHeading = useRef<HTMLHeadingElement>(null);
  const busy = submitting || deleting;
  const editingUnavailable =
    editingId !== null &&
    !loading &&
    !reports.some((report) => report.id === editingId && report.status === "OPEN");
  const deleteUnavailable =
    deleteTarget !== null &&
    !loading &&
    !reports.some((report) => report.id === deleteTarget.id && report.status === "OPEN");

  useEffect(() => {
    if (deleteTarget && !deleteDialog.current?.open) deleteDialog.current?.showModal();
    else if (!deleteTarget) deleteDialog.current?.close();
  }, [deleteTarget]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const controller = new AbortController();
    setLoading(true);

    void getStoreReports(storeId, controller.signal)
      .then((data) => {
        if (!active || !mounted.current || controller.signal.aborted) return;
        setReports(data);
      })
      .catch((err: unknown) => {
        if (!active || !mounted.current || controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
        } else {
          setError(err instanceof Error ? err.message : "제보 내역을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active && mounted.current) setLoading(false);
      });

    return () => {
      active = false;
      mounted.current = false;
      controller.abort();
    };
  }, [storeId, version, onSessionExpired]);

  function resetForm(): void {
    setEditingId(null);
    setType("CLOSURE_SUSPECTED");
    setDescription("");
  }

  function handleFailure(err: unknown, fallback: string): void {
    if (!mounted.current) return;
    if (err instanceof ApiError && err.status === 401) {
      onSessionExpired();
    } else {
      setError(err instanceof Error ? err.message : fallback);
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setVersion((value) => value + 1);
      }
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (mutation.current || loading || editingUnavailable) return;
    const trimmed = description.trim();
    if (!trimmed) {
      setError("제보 내용을 1자 이상 입력해 주세요.");
      return;
    }
    if (trimmed.length > 500) {
      setError("제보 내용은 500자 이하로 입력해 주세요.");
      return;
    }

    mutation.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      if (editingId === null) {
        await reportStore(storeId, { type, description: trimmed });
      } else {
        const updated = await updateStoreReport(storeId, editingId, { type, description: trimmed });
        if (!mounted.current) return;
        setReports((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      }
      if (!mounted.current) return;
      resetForm();
      setNotice(
        editingId === null
          ? "제보가 접수되었습니다. 처리 결과는 아래 내 제보 내역에서 확인해 주세요."
          : "제보가 수정되었습니다.",
      );
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      handleFailure(err, "제보를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      mutation.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (mutation.current || !deleteTarget || loading || deleteUnavailable) return;
    mutation.current = true;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await deleteStoreReport(storeId, deleteTarget.id);
      if (!mounted.current) return;
      setReports((items) => items.filter((item) => item.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      setNotice("제보가 삭제되었습니다.");
      setVersion((value) => value + 1);
    } catch (err: unknown) {
      handleFailure(err, "제보를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      mutation.current = false;
      if (mounted.current) setDeleting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="modal-content hybrid-card store-report-modal">
        <header className="summary-card-header">
          <div className="summary-tag-row">
            <span className="pill-badge secondary">매장 제보</span>
            <button
              type="button"
              className="store-report-close"
              aria-label="닫기"
              title="닫기"
              onClick={onClose}
              disabled={busy}
              id="btnCloseReportModal"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <h2 id="report-modal-title">{storeName} 정보 제보</h2>
          <p className="report-guidance-text">
            매장 정보가 실제와 다르다면 알려 주세요. 내용을 확인해 정확한 정보를 안내하겠습니다.
          </p>
        </header>

        <div className="summary-card-body">
          {notice && (
            <p className="notice-text" role="status" id="reportNoticeBox">
              {notice}
            </p>
          )}
          {!deleteTarget && <StatusAlert message={error} />}

          <form
            className="store-report-form"
            aria-label={editingId === null ? "매장 제보" : "제보 수정"}
            onSubmit={(e) => void handleSubmit(e)}
          >
            {editingId !== null && (
              <p className="field-help-text" role="status">
                {editingUnavailable
                  ? "확인이 시작되었거나 삭제된 제보입니다. 작성 중인 내용은 남겨 두었습니다."
                  : "접수한 제보를 수정하고 있습니다."}
              </p>
            )}
            <div className="field-group">
              <label className="field-label" htmlFor="reportTypeSelect">
                제보 유형
              </label>
              <select
                id="reportTypeSelect"
                className="input-box"
                value={type}
                disabled={busy}
                onChange={(e) => setType(e.target.value as ReportType)}
              >
                <option value="CLOSURE_SUSPECTED">폐업 의심</option>
                <option value="INACTIVE">장기 미운영</option>
                <option value="LOCATION_ERROR">위치 오류</option>
              </select>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="reportDescriptionInput">
                제보 내용 (최대 500자)
              </label>
              <textarea
                id="reportDescriptionInput"
                ref={descriptionInput}
                className="input-box"
                rows={4}
                maxLength={500}
                required
                value={description}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="현장 상황이나 오류 내용을 구체적으로 작성해 주세요."
              />
            </div>

            <div className="report-form-actions">
              <button
                type="submit"
                id="btnSubmitStoreReport"
                className="btn-query-store"
                disabled={busy || loading || editingUnavailable || !description.trim()}
              >
                {submitting ? "저장 중..." : editingId === null ? "제보 접수" : "수정 저장"}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  className="text-action-link"
                  disabled={busy}
                  onClick={() => {
                    resetForm();
                    setError(null);
                    setNotice(null);
                  }}
                >
                  수정 취소
                </button>
              )}
            </div>
          </form>

          <section className="own-reports-section" aria-label="본인 제보 내역">
            <h3 ref={reportsHeading} tabIndex={-1}>
              내 제보 내역
            </h3>
            {loading && <p role="status">제보 내역을 확인하는 중입니다...</p>}
            {!loading && reports.length === 0 && (
              <p className="field-help-text">이 매장에 접수한 제보가 없습니다.</p>
            )}
            <ul className="own-reports-list">
              {reports.map((report) => (
                <li key={report.id} className="own-report-item">
                  <div className="own-report-header">
                    <strong>{formatReportType(report.type)}</strong>
                    <span className={`badge-tag badge-${report.status.toLowerCase()}`}>
                      {formatReportStatus(report.status)}
                    </span>
                  </div>
                  <p className="own-report-desc">{report.description}</p>
                  {report.status === "RESOLVED" && report.resolution && (
                    <p className="own-report-resolution" role="status">
                      <strong>처리 내용:</strong> {report.resolution}
                    </p>
                  )}
                  <div className="own-report-footer">
                    <span className="own-report-date">{report.createdAt.slice(0, 10)} 접수</span>
                    {report.status === "OPEN" && (
                      <div className="own-report-actions">
                        <button
                          type="button"
                          className="text-action-link"
                          disabled={busy || loading}
                          aria-label={`${formatReportType(report.type)} 제보 수정`}
                          onClick={() => {
                            setEditingId(report.id);
                            setType(report.type);
                            setDescription(report.description);
                            setError(null);
                            setNotice(null);
                            descriptionInput.current?.focus();
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-action-link report-delete-button"
                          disabled={busy || loading}
                          aria-label={`${formatReportType(report.type)} 제보 삭제`}
                          onClick={(event) => {
                            deleteTrigger.current = event.currentTarget;
                            setError(null);
                            setDeleteTarget(report);
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <dialog
        className="hybrid-card multi-market-confirm-modal"
        aria-labelledby="delete-report-title"
        aria-describedby="delete-report-description"
        ref={deleteDialog}
        onCancel={(event) => {
          if (deleting) event.preventDefault();
          else setDeleteTarget(null);
        }}
        onClose={() => {
          setDeleteTarget(null);
          if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus();
          else reportsHeading.current?.focus();
        }}
      >
        <header className="summary-card-header">
          <h3 id="delete-report-title">제보를 삭제할까요?</h3>
        </header>
        <div className="summary-card-body">
          <p id="delete-report-description">삭제한 제보는 되돌릴 수 없습니다.</p>
          {deleteTarget && <StatusAlert message={error} />}
          <div className="checkout-actions">
            <button
              type="button"
              className="text-action-link"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-query-store"
              disabled={deleting || loading || deleteUnavailable}
              onClick={() => void handleDelete()}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
