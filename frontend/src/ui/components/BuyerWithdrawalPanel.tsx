import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { withdrawBuyer } from "../../api/accounts";
import { startOAuth } from "../../api/auth";
import { ApiError } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface Props {
  hasLocalPassword?: boolean;
  linkedProviders?: ("kakao" | "google")[];
  onWithdrawn: () => void;
  onSessionExpired: () => void;
  reauthConfirmed?: boolean;
}

export function BuyerWithdrawalPanel({
  hasLocalPassword = true,
  linkedProviders = [],
  onWithdrawn,
  onSessionExpired,
  reauthConfirmed = false,
}: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 소셜 재인증 후 복귀 시 탈퇴 확인 모달 자동 오픈
  useEffect(() => {
    if (reauthConfirmed) {
      setOpen(true);
    }
  }, [reauthConfirmed]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (error && !submitting && hasLocalPassword) passwordInput.current?.focus();
  }, [error, submitting, hasLocalPassword]);

  function close(): void {
    if (pending.current) return;
    setOpen(false);
    setPassword("");
    setError(null);
  }

  async function handleOAuthReauthStart(provider: string): Promise<void> {
    setStartingOAuth(true);
    setError(null);
    try {
      const response = await startOAuth(provider, "withdraw");
      if (!response.authorizationUrl) {
        throw new Error("소셜 재인증 주소를 받지 못했습니다.");
      }
      window.location.assign(response.authorizationUrl);
    } catch (failure: unknown) {
      if (!mounted.current) return;
      setStartingOAuth(false);
      if (failure instanceof ApiError && failure.status === 401) {
        onSessionExpired();
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "소셜 재인증을 시작하지 못했습니다. 다시 시도해 주세요.",
        );
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending.current) return;
    if (hasLocalPassword && !password) return;

    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // 로컬 계정은 비밀번호 전달, 소셜 전용 계정은 비밀번호 생략 (쿠키 재인증 확인)
      await withdrawBuyer(hasLocalPassword ? password : undefined);
      if (mounted.current) onWithdrawn();
    } catch (failure: unknown) {
      if (!mounted.current) return;
      setPassword("");
      if (failure instanceof ApiError && failure.status === 401) {
        onSessionExpired();
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "회원 탈퇴를 처리하지 못했습니다. 다시 시도해 주세요.",
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const availableProviders = linkedProviders || [];

  return (
    <section className="buyer-withdrawal-panel" aria-labelledby="withdrawal-heading">
      <h2 id="withdrawal-heading">회원 탈퇴</h2>
      <p>미완료 주문이나 환불이 없을 때 탈퇴할 수 있습니다.</p>
      <button type="button" className="withdrawal-link" ref={trigger} onClick={() => setOpen(true)}>
        회원 탈퇴
      </button>
      <dialog
        ref={dialog}
        className="hybrid-card multi-market-confirm-modal"
        aria-labelledby="withdrawal-dialog-heading"
        aria-describedby="withdrawal-description"
        onCancel={(event) => {
          if (pending.current) event.preventDefault();
          else close();
        }}
        onClose={() => {
          close();
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <header className="summary-card-header">
          <h3 id="withdrawal-dialog-heading">회원 탈퇴하시겠어요?</h3>
        </header>
        <form
          className="summary-card-body withdrawal-form"
          onSubmit={(event) => void submit(event)}
        >
          <p id="withdrawal-description">
            탈퇴하면 로그인할 수 없고 이름·이메일·비밀번호가 정리됩니다. 주문·환불 기록은 남으며
            같은 로그인 아이디는 다시 사용할 수 없습니다.
          </p>

          {hasLocalPassword ? (
            <div className="field-group">
              <label className="field-label" htmlFor="withdrawal-password">
                현재 비밀번호
              </label>
              <input
                className="input-box"
                id="withdrawal-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                ref={passwordInput}
                required
              />
            </div>
          ) : reauthConfirmed ? (
            <div
              className="field-group"
              style={{
                padding: "12px",
                background: "var(--color-surface)",
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "var(--color-primary)",
                  fontWeight: 600,
                }}
              >
                ✓ 소셜 계정 본인 재인증이 완료되었습니다 (5분간 유효).
              </p>
              <p
                style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--color-text-muted)" }}
              >
                비밀번호 입력 없이 아래 버튼을 눌러 탈퇴를 완료할 수 있습니다.
              </p>
            </div>
          ) : (
            <div
              className="field-group"
              style={{
                padding: "12px",
                background: "var(--color-surface)",
                borderRadius: "8px",
                border: "1px solid var(--color-border)",
              }}
            >
              <p style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
                소셜 연동 계정 본인 확인
              </p>
              <p
                style={{
                  margin: "4px 0 12px 0",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                }}
              >
                탈퇴를 위해 연결된 소셜 계정으로 본인 재인증이 필요합니다.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {availableProviders.includes("kakao") && (
                  <button
                    type="button"
                    className="btn-oauth btn-oauth-kakao"
                    style={{ padding: "8px 16px", fontSize: "13px" }}
                    disabled={startingOAuth || submitting}
                    onClick={() => void handleOAuthReauthStart("kakao")}
                  >
                    카카오로 본인 재인증
                  </button>
                )}
                {availableProviders.includes("google") && (
                  <button
                    type="button"
                    className="btn-oauth btn-oauth-google"
                    style={{ padding: "8px 16px", fontSize: "13px" }}
                    disabled={startingOAuth || submitting}
                    onClick={() => void handleOAuthReauthStart("google")}
                  >
                    구글로 본인 재인증
                  </button>
                )}
                {availableProviders.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--color-danger)", margin: 0 }}>
                    연결된 소셜 계정 정보가 없습니다. 고객센터에 문의해 주세요.
                  </p>
                )}
              </div>
            </div>
          )}

          <StatusAlert id="withdrawal-error" message={error} />
          <div className="checkout-actions">
            <button
              type="button"
              className="text-action-link"
              disabled={submitting || startingOAuth}
              onClick={close}
              autoFocus
            >
              취소
            </button>
            <button
              type="submit"
              className="withdrawal-confirm-button"
              disabled={
                submitting ||
                startingOAuth ||
                (hasLocalPassword && !password) ||
                (!hasLocalPassword && !reauthConfirmed)
              }
            >
              {submitting ? "탈퇴 처리 중…" : "탈퇴하기"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
