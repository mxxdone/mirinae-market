import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { changeBuyerDisplayName } from "../../api/accounts";
import { getAuthGeneration } from "../../api/client";
import { ApiError, type UserMe } from "../../api/types";
import { validateDisplayName } from "../../validation/signupValidation";
import { BuyerWithdrawalPanel } from "../components/BuyerWithdrawalPanel";

interface BuyerSummaryScreenProps {
  user: UserMe;
  onBrowse: () => void;
  onWithdrawn: () => void;
  onSessionExpired: () => void;
  onDisplayNameUpdated?: (buyerId: number, displayName: string) => void;
  reauthConfirmed?: boolean;
}

/**
 * 구매자가 직접 여는 내 계정 화면
 * 실제 인증된 계정의 me 응답(표시이름, 로그인 아이디, 역할, hasLocalPassword) 중심 렌더링
 * 소셜 전용 계정에는 내부 로컬 ID를 일반 로그인 가능 ID처럼 오인하지 않도록 안내합니다.
 * 활성 구매자 본인의 표시 이름 변경 폼 및 부모 상태 동기화를 제공합니다.
 */
export function BuyerSummaryScreen({
  user,
  onBrowse,
  onWithdrawn,
  onSessionExpired,
  onDisplayNameUpdated,
  reauthConfirmed = false,
}: BuyerSummaryScreenProps): ReactElement {
  const roleText = user.role === "BUYER" ? "구매자" : "입점 상인";
  const hasLocalPassword = user.hasLocalPassword !== false;

  const [editingName, setEditingName] = useState(user.displayName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const requestIdRef = useRef(0);
  const currentUserIdRef = useRef(user.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentUserIdRef.current = user.id;
    setEditingName(user.displayName);
  }, [user.id, user.displayName]);

  async function handleSaveDisplayName(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    const validationError = validateDisplayName(editingName);
    if (validationError) {
      setFieldError(validationError);
      setStatusMessage(null);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFieldError(null);
    setStatusMessage(null);

    const requestGen = getAuthGeneration();
    const requestUserId = user.id;
    const currentReqId = ++requestIdRef.current;

    try {
      const response = await changeBuyerDisplayName(editingName);
      if (!mountedRef.current) return;
      if (currentReqId !== requestIdRef.current) return;
      if (getAuthGeneration() !== requestGen || currentUserIdRef.current !== requestUserId) return;

      setStatusMessage({ type: "success", text: "표시 이름이 변경되었습니다." });
      setEditingName(response.displayName);
      onDisplayNameUpdated?.(requestUserId, response.displayName);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (currentReqId !== requestIdRef.current) return;
      if (getAuthGeneration() !== requestGen || currentUserIdRef.current !== requestUserId) return;

      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }

      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "표시 이름을 변경하지 못했습니다. 다시 시도해 주세요.";
      setStatusMessage({ type: "error", text: message });
    } finally {
      isSubmittingRef.current = false;
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <section
      id="screen-buyer-summary"
      className="screen-panel active"
      aria-labelledby="heading-buyer-summary"
    >
      <div className="hybrid-card buyer-account-card">
        <div className="summary-card-header">
          <div className="buyer-account-heading">
            <div className="summary-tag-row">
              <span className="pill-badge primary">구매자 계정</span>
            </div>
            <h1 id="heading-buyer-summary" className="summary-heading">
              내 계정
            </h1>
            <p className="summary-subtext">내 계정 정보를 확인할 수 있습니다.</p>
          </div>
        </div>

        <div className="summary-card-body">
          <button type="button" className="btn-submit-primary" onClick={onBrowse}>
            장보기로 돌아가기
          </button>
          {/* 계정 기본정보 테이블 */}
          <div>
            <table className="info-data-table">
              <caption
                style={{
                  textAlign: "left",
                  fontSize: "15px",
                  fontWeight: 700,
                  marginBottom: "10px",
                  color: "var(--color-text-main)",
                }}
              >
                계정 기본정보
              </caption>
              <tbody>
                <tr>
                  <th scope="row">표시 이름</th>
                  <td id="userSummaryDisplayName">{user.displayName}</td>
                </tr>
                {user.role === "BUYER" && (
                  <tr className="buyer-display-name-row">
                    <th scope="row">이름 변경</th>
                    <td>
                      <form
                        id="formChangeDisplayName"
                        noValidate
                        onSubmit={(e) => void handleSaveDisplayName(e)}
                      >
                        <div className="field-group" style={{ marginBottom: 0 }}>
                          <label
                            htmlFor="inputChangeDisplayName"
                            className="field-label"
                            style={{ fontSize: "13px" }}
                          >
                            새 표시 이름
                          </label>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                              alignItems: "stretch",
                              marginTop: "4px",
                              width: "100%",
                            }}
                          >
                            <input
                              type="text"
                              id="inputChangeDisplayName"
                              className="input-box"
                              style={{
                                flex: "1 1 180px",
                                minWidth: 0,
                                minHeight: "44px",
                                padding: "8px 12px",
                                fontSize: "14px",
                                boxSizing: "border-box",
                              }}
                              value={editingName}
                              disabled={isSubmitting}
                              placeholder="새 표시 이름 입력"
                              aria-invalid={fieldError ? "true" : "false"}
                              aria-describedby={
                                fieldError
                                  ? "changeDisplayNameError changeDisplayNameHelp"
                                  : "changeDisplayNameHelp"
                              }
                              onChange={(e) => {
                                setEditingName(e.target.value);
                                setFieldError(null);
                                setStatusMessage(null);
                              }}
                            />
                            <button
                              type="submit"
                              id="btnSubmitChangeDisplayName"
                              className="btn-submit-primary"
                              style={{
                                flex: "0 0 auto",
                                minHeight: "44px",
                                padding: "0 16px",
                                fontSize: "14px",
                              }}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? "저장 중…" : "변경"}
                            </button>
                          </div>
                          {fieldError && (
                            <p
                              id="changeDisplayNameError"
                              className="field-error-msg"
                              role="alert"
                              style={{ marginTop: "4px" }}
                            >
                              {fieldError}
                            </p>
                          )}
                          <p
                            id="changeDisplayNameHelp"
                            className="field-help-text"
                            style={{ marginTop: "4px" }}
                          >
                            한글·영문·숫자 2~10자
                          </p>
                          {statusMessage && (
                            <p
                              id="changeDisplayNameStatus"
                              className={
                                statusMessage.type === "success"
                                  ? "field-help-text"
                                  : "field-error-msg"
                              }
                              role={statusMessage.type === "success" ? "status" : "alert"}
                              style={{
                                marginTop: "4px",
                                color:
                                  statusMessage.type === "success"
                                    ? "var(--color-primary, #2563eb)"
                                    : undefined,
                                fontWeight: statusMessage.type === "success" ? 600 : undefined,
                              }}
                            >
                              {statusMessage.text}
                            </p>
                          )}
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
                <tr>
                  <th scope="row">이메일</th>
                  <td id="userSummaryEmail" style={{ overflowWrap: "anywhere" }}>
                    {user.email ?? "확인할 수 없음"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">로그인 아이디</th>
                  <td id="userSummaryLoginId">
                    {hasLocalPassword ? user.loginId : "소셜 연동 계정 (아이디 로그인 불가)"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">계정 역할</th>
                  <td id="userSummaryRole">
                    <span className="role-highlight-text">{roleText}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {user.role === "BUYER" && (
            <BuyerWithdrawalPanel
              hasLocalPassword={hasLocalPassword}
              linkedProviders={user.linkedProviders}
              reauthConfirmed={reauthConfirmed}
              onWithdrawn={onWithdrawn}
              onSessionExpired={onSessionExpired}
            />
          )}
        </div>
      </div>
    </section>
  );
}
