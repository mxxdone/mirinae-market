import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { saveBuyerProfile, type BuyerPasswordChange } from "../../api/accounts";
import { getAuthGeneration } from "../../api/client";
import { ApiError, type UserMe } from "../../api/types";
import {
  validateDisplayName,
  validatePassword,
  validatePasswordConfirmation,
} from "../../validation/signupValidation";
import { focusFirstInvalidField } from "../authFocus";
import { BuyerWithdrawalPanel } from "../components/BuyerWithdrawalPanel";

interface BuyerSummaryScreenProps {
  user: UserMe;
  onBrowse: () => void;
  onWithdrawn: () => void;
  onSessionExpired: () => void;
  onPasswordChanged: () => void;
  onDisplayNameUpdated?: (buyerId: number, displayName: string) => void;
  reauthConfirmed?: boolean;
}

const passwordFields = [
  { name: "currentPassword", label: "현재 비밀번호", autoComplete: "current-password" },
  { name: "newPassword", label: "변경할 비밀번호", autoComplete: "new-password" },
  { name: "confirmation", label: "변경할 비밀번호 확인", autoComplete: "new-password" },
] as const;

const emptyPassword = { currentPassword: "", newPassword: "", confirmation: "" };
type FieldErrors = Partial<Record<"displayName" | keyof BuyerPasswordChange, string | null>>;

export function BuyerSummaryScreen({
  user,
  onBrowse,
  onWithdrawn,
  onSessionExpired,
  onPasswordChanged,
  onDisplayNameUpdated,
  reauthConfirmed = false,
}: BuyerSummaryScreenProps): ReactElement {
  const hasLocalPassword = user.hasLocalPassword !== false;
  const [editingName, setEditingName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [password, setPassword] = useState(emptyPassword);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mountedRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameEditButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function closeNameEditor(): void {
    setIsEditingName(false);
    requestAnimationFrame(() => nameEditButtonRef.current?.focus());
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    const nameChanged = isEditingName && editingName !== user.displayName;
    const passwordChanged = hasLocalPassword && Object.values(password).some(Boolean);
    const nextErrors: FieldErrors = {
      displayName: nameChanged ? validateDisplayName(editingName) : null,
      currentPassword:
        passwordChanged && !password.currentPassword ? "현재 비밀번호를 입력해 주세요." : null,
      newPassword: passwordChanged
        ? (validatePassword(password.newPassword) ??
          (password.newPassword === password.currentPassword
            ? "새 비밀번호는 현재 비밀번호와 달라야 합니다."
            : null))
        : null,
      confirmation: passwordChanged
        ? validatePasswordConfirmation(password.newPassword, password.confirmation)
        : null,
    };
    setStatusMessage(null);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      focusFirstInvalidField(event.currentTarget);
      return;
    }
    if (!nameChanged && !passwordChanged) {
      setStatusMessage({ type: "success", text: "변경된 내용이 없습니다." });
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const requestGen = getAuthGeneration();
    const sameSession = () => getAuthGeneration() === requestGen;
    try {
      const response = await saveBuyerProfile({
        ...(nameChanged ? { displayName: editingName } : {}),
        ...(passwordChanged ? { password } : {}),
      });
      if (!sameSession()) return;
      if (passwordChanged) {
        onPasswordChanged();
        return;
      }
      if (!mountedRef.current) return;
      onDisplayNameUpdated?.(user.id, response.displayName);
      closeNameEditor();
      setStatusMessage({ type: "success", text: "표시 이름이 변경되었습니다." });
    } catch (err: unknown) {
      if (!mountedRef.current || !sameSession()) return;
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setStatusMessage({
        type: "error",
        text:
          err instanceof ApiError
            ? err.message
            : "변경 사항을 저장하지 못했습니다. 다시 시도해 주세요.",
      });
    } finally {
      isSubmittingRef.current = false;
      if (mountedRef.current) setIsSubmitting(false);
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
          </div>
        </div>

        <div className="summary-card-body">
          <button type="button" className="btn-secondary-sm" onClick={onBrowse}>
            장보기로 돌아가기
          </button>

          <form
            className="buyer-settings-form"
            aria-label="계정 설정"
            noValidate
            onSubmit={(e) => void saveSettings(e)}
          >
            <table className="info-data-table">
              <caption className="buyer-account-caption">계정 기본정보</caption>
              <tbody>
                <tr>
                  <th scope="row" id="buyer-display-name-label">
                    표시 이름
                  </th>
                  <td>
                    <div className="buyer-name-control">
                      {isEditingName ? (
                        <>
                          <input
                            ref={nameInputRef}
                            type="text"
                            id="inputChangeDisplayName"
                            name="displayName"
                            autoComplete="nickname"
                            aria-labelledby="buyer-display-name-label"
                            className="input-box"
                            value={editingName}
                            disabled={isSubmitting}
                            aria-invalid={Boolean(errors.displayName)}
                            aria-describedby={
                              errors.displayName
                                ? "changeDisplayNameError changeDisplayNameHelp"
                                : "changeDisplayNameHelp"
                            }
                            onChange={(e) => {
                              setEditingName(e.target.value);
                              setErrors((previous) => ({ ...previous, displayName: null }));
                              setStatusMessage(null);
                            }}
                          />
                          <button
                            type="button"
                            className="text-action-link"
                            aria-label="표시 이름 변경 취소"
                            disabled={isSubmitting}
                            onClick={() => {
                              setErrors((previous) => ({ ...previous, displayName: null }));
                              closeNameEditor();
                            }}
                          >
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          <span id="userSummaryDisplayName">{user.displayName}</span>
                          {user.role === "BUYER" && (
                            <button
                              ref={nameEditButtonRef}
                              type="button"
                              id="btnEditBuyerDisplayName"
                              className="text-action-link"
                              aria-label="표시 이름 변경"
                              disabled={isSubmitting}
                              onClick={() => {
                                setEditingName(user.displayName);
                                setStatusMessage(null);
                                setIsEditingName(true);
                                requestAnimationFrame(() => nameInputRef.current?.focus());
                              }}
                            >
                              변경
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {isEditingName && (
                      <>
                        <p id="changeDisplayNameHelp" className="field-help-text">
                          한글·영문·숫자 2~10자
                        </p>
                        {errors.displayName && (
                          <p id="changeDisplayNameError" className="field-error-msg">
                            {errors.displayName}
                          </p>
                        )}
                      </>
                    )}
                  </td>
                </tr>
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
                    <span className="role-highlight-text">
                      {user.role === "BUYER" ? "구매자" : "입점 상인"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            {user.role === "BUYER" && (
              <>
                {hasLocalPassword && (
                  <fieldset
                    className="buyer-password-fields"
                    aria-describedby="buyer-password-help"
                  >
                    <legend>비밀번호 변경</legend>
                    <p id="buyer-password-help" className="field-help-text">
                      비밀번호를 유지하려면 아래 세 칸을 비워 두세요. 변경 후에는 새 비밀번호로 다시
                      로그인해야 합니다.
                    </p>
                    {passwordFields.map(({ name, label, autoComplete }) => {
                      const id = `buyer-${name}`;
                      const error = errors[name];
                      const describedBy = [
                        error && `${id}-error`,
                        name === "newPassword" && "buyer-new-password-help",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <div className="field-group" key={name}>
                          <label className="field-label" htmlFor={id}>
                            {label}
                          </label>
                          <input
                            type="password"
                            id={id}
                            name={name}
                            autoComplete={autoComplete}
                            className="input-box"
                            value={password[name]}
                            disabled={isSubmitting}
                            aria-invalid={Boolean(error)}
                            aria-describedby={describedBy || undefined}
                            onChange={(e) => {
                              setPassword((previous) => ({ ...previous, [name]: e.target.value }));
                              setErrors((previous) => ({
                                ...previous,
                                [name]: null,
                                ...(name === "newPassword" ? { confirmation: null } : {}),
                              }));
                              setStatusMessage(null);
                            }}
                          />
                          {name === "newPassword" && (
                            <p className="field-help-text" id="buyer-new-password-help">
                              공백 없이 영문·숫자·특수문자를 포함한 8~32자
                            </p>
                          )}
                          {error && (
                            <p id={`${id}-error`} className="field-error-msg">
                              {error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </fieldset>
                )}
                {statusMessage?.type === "error" && (
                  <p className="field-error-msg" role="alert" id="changeDisplayNameStatus">
                    {statusMessage.text}
                  </p>
                )}
                <div
                  role="status"
                  className="field-help-text"
                  id={statusMessage?.type === "success" ? "changeDisplayNameStatus" : undefined}
                >
                  {statusMessage?.type === "success" ? statusMessage.text : ""}
                </div>
                <button
                  type="submit"
                  id="btnSaveBuyerSettings"
                  className="btn-submit-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "저장 중…" : "변경 사항 저장"}
                </button>
              </>
            )}
          </form>
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
