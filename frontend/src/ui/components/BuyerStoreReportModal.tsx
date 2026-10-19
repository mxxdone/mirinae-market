import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import {
  formatReportStatus,
  formatReportType,
  getStoreReports,
  reportStore,
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const mounted = useRef(true);

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

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      setError("제보 내용을 1자 이상 입력해 주세요.");
      return;
    }
    if (trimmed.length > 500) {
      setError("제보 내용은 500자 이하로 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await reportStore(storeId, { type, description: trimmed });
      if (!mounted.current) return;
      setDescription("");
      setNotice(
        "매장 제보가 접수되었습니다. 관리자가 사실 확인을 진행하며, 즉시 자동 운영 중지되지는 않습니다.",
      );
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
      } else {
        setError(
          err instanceof Error ? err.message : "제보를 접수하지 못했습니다. 다시 시도해 주세요.",
        );
      }
    } finally {
      if (mounted.current) setSubmitting(false);
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
              className="text-action-link"
              onClick={onClose}
              disabled={submitting}
              id="btnCloseReportModal"
            >
              닫기
            </button>
          </div>
          <h2 id="report-modal-title">{storeName} 정보 제보</h2>
          <p className="report-guidance-text">
            구매 이력 없이도 매장 정보를 제보할 수 있습니다. 접수된 제보는 관리자가 등록된 담당자
            연락처로 사실을 확인하며, 제보만으로 자동 운영 중지되거나 폐업 처리되지 않습니다.
          </p>
        </header>

        <div className="summary-card-body">
          {notice && (
            <p className="notice-text" role="status" id="reportNoticeBox">
              {notice}
            </p>
          )}
          <StatusAlert message={error} />

          <form className="store-report-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="field-group">
              <label className="field-label" htmlFor="reportTypeSelect">
                제보 유형
              </label>
              <select
                id="reportTypeSelect"
                className="input-box"
                value={type}
                disabled={submitting}
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
                className="input-box"
                rows={4}
                maxLength={500}
                required
                value={description}
                disabled={submitting}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="현장 상황이나 오류 내용을 구체적으로 작성해 주세요."
              />
            </div>

            <button
              type="submit"
              id="btnSubmitStoreReport"
              className="btn-query-store"
              disabled={submitting || !description.trim()}
            >
              {submitting ? "제보 접수 중..." : "제보 접수"}
            </button>
          </form>

          <section className="own-reports-section" aria-label="본인 제보 내역">
            <h3>내 제보 내역</h3>
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
                  <span className="own-report-date">{report.createdAt.slice(0, 10)} 접수</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
