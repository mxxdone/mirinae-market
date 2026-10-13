import type { ReactElement } from "react";

interface SignupCompleteScreenProps {
  loginId: string;
  onNavigateLogin: () => void;
}

/**
 * 가입 완료 화면
 * 개인정보 보호를 위한 자동 로그인 미지원 명확 안내 및 로그인 이동
 */
export function SignupCompleteScreen({
  loginId,
  onNavigateLogin,
}: SignupCompleteScreenProps): ReactElement {
  return (
    <section
      id="screen-signup-complete"
      className="screen-panel active"
      aria-labelledby="heading-complete"
    >
      <div className="hybrid-card single-card-wrap">
        <div className="complete-card-body">
          <div className="success-badge-circle" aria-hidden="true">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>

          <h1 id="heading-complete" className="complete-title">
            단골 등록이 완료되었습니다
          </h1>
          <p className="complete-subtext">
            미리내 마켓의 단골손님이 되신 것을 환영합니다.
            {loginId && (
              <>
                <br />
                등록된 아이디: <strong>{loginId}</strong>
              </>
            )}
            <br />
            오늘부터 전통시장의 신선함을 예약 방문으로 편리하게 만나보세요.
          </p>

          <div className="complete-notice-box">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ flexShrink: 0, marginTop: "2px" }}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>안내 사항:</strong> 개인정보 보호 및 보안을 위해{" "}
              <strong>자동 로그인은 지원하지 않습니다.</strong> 가입하신 아이디와 비밀번호로 직접
              로그인해 주세요.
            </div>
          </div>

          <button
            type="button"
            id="btnGoToLogin"
            className="btn-submit-primary"
            style={{ maxWidth: "320px" }}
            onClick={onNavigateLogin}
          >
            <span>로그인 화면으로 이동</span>
          </button>
        </div>
      </div>
    </section>
  );
}
