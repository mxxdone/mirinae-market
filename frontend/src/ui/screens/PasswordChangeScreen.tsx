import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  changeSellerPassword,
  getSellerProfile,
  type SellerProfile,
} from "../../api/sellerAccount";
import { ApiError } from "../../api/types";

export function PasswordChangeScreen({
  required = false,
  onChanged,
  onSessionExpired,
  onLogout,
}: {
  required?: boolean;
  onChanged?: () => Promise<void>;
  onSessionExpired: () => void;
  onLogout?: () => void;
}) {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!required) return;
    const controller = new AbortController();
    let active = true;

    void getSellerProfile(controller.signal)
      .then((data) => {
        if (active && mountedRef.current) setProfile(data);
      })
      .catch((err: unknown) => {
        if (!active || !mountedRef.current) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [required, onSessionExpired]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (next !== confirm) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (current === next) {
      setError("새 비밀번호는 현재 비밀번호와 달라야 합니다.");
      return;
    }

    setBusy(true);
    try {
      await changeSellerPassword(current, next);
      if (!mountedRef.current) return;
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
      await onChanged?.();
    } catch (err) {
      if (!mountedRef.current) return;
      setCurrent("");
      setNext("");
      setConfirm("");
      if (err instanceof ApiError && err.status === 401) onSessionExpired();
      else
        setError(
          err instanceof Error
            ? err.message
            : "변경 결과를 확인하지 못했습니다. 다시 로그인해 확인해 주세요.",
        );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <section className="hybrid-card admin-detail" aria-label="비밀번호 변경">
      <h1>{required ? "첫 비밀번호 변경" : "비밀번호 변경"}</h1>
      {required && <p>관리자에게 받은 비밀번호를 바꾼 뒤 판매 업무를 시작할 수 있습니다.</p>}
      <p>8~32자의 영문·숫자·특수문자를 모두 포함하고 현재 비밀번호와 다르게 입력해 주세요.</p>

      {required && profile && (
        <div style={{ margin: "16px 0 20px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>등록된 판매자 정보</h2>
          <dl className="admin-values">
            <div>
              <dt>로그인 ID</dt>
              <dd id="sellerFirstProfileLoginId">{profile.loginId}</dd>
            </div>
            <div>
              <dt>담당자 이름</dt>
              <dd id="sellerFirstProfileContactName">
                {profile.contactName ?? "담당자 정보 미등록"}
              </dd>
            </div>
            <div>
              <dt>담당자 전화번호</dt>
              <dd id="sellerFirstProfileContactPhone">
                {profile.contactPhone ?? "담당자 정보 미등록"}
              </dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd id="sellerFirstProfileEmail">{profile.email}</dd>
            </div>
          </dl>
        </div>
      )}

      <form className="market-form" onSubmit={(event) => void submit(event)}>
        <label>
          현재 비밀번호
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          새 비밀번호
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={32}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button id="btnChangePassword" disabled={busy} type="submit">
          {busy ? "변경 중…" : "비밀번호 변경"}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}
      {success && <p role="status">비밀번호를 변경했습니다.</p>}

      {onLogout && (
        <button
          type="button"
          id="btnLogoutPasswordChange"
          style={{ marginTop: "16px" }}
          onClick={onLogout}
        >
          로그아웃
        </button>
      )}
    </section>
  );
}
