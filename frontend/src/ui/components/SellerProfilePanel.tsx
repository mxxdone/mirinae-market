import { useEffect, useState } from "react";
import { getSellerProfile, type SellerProfile } from "../../api/sellerAccount";
import { ApiError } from "../../api/types";
import { PasswordChangeScreen } from "../screens/PasswordChangeScreen";

export function SellerProfilePanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setProfile(null);

    void getSellerProfile(controller.signal)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onSessionExpired();
        else setError(err instanceof Error ? err.message : "정보를 불러오지 못했습니다.");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [version, onSessionExpired]);

  return (
    <section aria-label="판매자 본인 정보">
      <h2>담당자 정보</h2>
      {profile ? (
        <dl className="admin-values">
          <div>
            <dt>로그인 ID</dt>
            <dd id="sellerProfileLoginId">{profile.loginId}</dd>
          </div>
          <div>
            <dt>담당자 이름</dt>
            <dd id="sellerProfileContactName">{profile.contactName ?? "담당자 정보 미등록"}</dd>
          </div>
          <div>
            <dt>담당자 전화번호</dt>
            <dd id="sellerProfileContactPhone">{profile.contactPhone ?? "담당자 정보 미등록"}</dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd id="sellerProfileEmail">{profile.email}</dd>
          </div>
        </dl>
      ) : (
        !error && <p role="status">담당자 정보를 불러오는 중…</p>
      )}
      <p style={{ marginTop: "8px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        담당자 정보 수정은 관리자에게 요청해 주세요.
      </p>
      {error && (
        <p role="alert">
          {error}
          <button type="button" onClick={() => setVersion((v) => v + 1)}>
            다시 조회
          </button>
        </p>
      )}
      <PasswordChangeScreen onSessionExpired={onSessionExpired} />
    </section>
  );
}
