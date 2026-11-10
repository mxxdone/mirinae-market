import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { withdrawBuyer } from "../../api/accounts";
import { ApiError } from "../../api/types";
import { StatusAlert } from "./StatusAlert";

interface Props {
  onWithdrawn: () => void;
  onSessionExpired: () => void;
}

export function BuyerWithdrawalPanel({ onWithdrawn, onSessionExpired }: Props): ReactElement {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (error && !submitting) passwordInput.current?.focus();
  }, [error, submitting]);

  function close(): void {
    if (pending.current) return;
    setOpen(false);
    setPassword("");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending.current || !password) return;
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await withdrawBuyer(password);
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
          <StatusAlert id="withdrawal-error" message={error} />
          <div className="checkout-actions">
            <button
              type="button"
              className="text-action-link"
              disabled={submitting}
              onClick={close}
              autoFocus
            >
              취소
            </button>
            <button
              type="submit"
              className="withdrawal-confirm-button"
              disabled={submitting || !password}
            >
              {submitting ? "탈퇴 처리 중…" : "탈퇴하기"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
