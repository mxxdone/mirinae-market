import type { ReactElement } from "react";

function PolicyLinks(): ReactElement {
  return (
    <nav className="policy-links" aria-label="이용안내 및 개인정보 정책">
      <a
        href="/policies/terms.html"
        target="_blank"
        rel="noopener noreferrer"
        className="policy-link"
      >
        이용안내·약관<span className="sr-only"> (새 탭에서 열림)</span>
      </a>
      <span className="policy-link-separator" aria-hidden="true">
        ·
      </span>
      <a
        href="/policies/privacy.html"
        target="_blank"
        rel="noopener noreferrer"
        className="policy-link"
      >
        개인정보처리방침 (검토용)<span className="sr-only"> (새 탭에서 열림)</span>
      </a>
    </nav>
  );
}

export function AppFooter(): ReactElement {
  return (
    <footer className="app-footer" aria-label="서비스 정보 및 정책 안내">
      <div className="app-footer-inner">
        <span>미리내 마켓 · 동네 시장 예약 방문 수령</span>
        <PolicyLinks />
      </div>
    </footer>
  );
}

/** 문서를 새 탭으로 열어 작성 중인 가입 정보와 소셜 인증 흐름을 유지한다. */
export function SignupPolicyNotice(): ReactElement {
  return (
    <div className="signup-policy-notice">
      <p className="signup-policy-text">
        가입 전에 이용안내와 개인정보 처리 내용을 확인해 주세요.
      </p>
      <PolicyLinks />
    </div>
  );
}
