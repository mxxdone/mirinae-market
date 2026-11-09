import type { ReactElement } from "react";

interface SignupCompleteScreenProps {
  onNavigateLogin: () => void;
}

/**
 * 가입 완료 화면
 * 가입 완료를 알리고 로그인 화면으로 이동한다.
 */
export function SignupCompleteScreen({
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
            회원가입이 완료되었습니다.
          </h1>

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
