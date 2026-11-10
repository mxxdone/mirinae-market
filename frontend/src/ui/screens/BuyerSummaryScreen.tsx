import type { ReactElement } from "react";
import type { UserMe } from "../../api/types";
import { BuyerWithdrawalPanel } from "../components/BuyerWithdrawalPanel";

interface BuyerSummaryScreenProps {
  user: UserMe;
  onBrowse: () => void;
  onWithdrawn: () => void;
  onSessionExpired: () => void;
}

/**
 * 구매자가 직접 여는 내 계정 화면
 * 실제 인증된 계정의 me 응답(표시이름, 로그인 아이디, 역할) 중심 렌더링
 */
export function BuyerSummaryScreen({
  user,
  onBrowse,
  onWithdrawn,
  onSessionExpired,
}: BuyerSummaryScreenProps): ReactElement {
  const roleText = user.role === "BUYER" ? "구매자" : "입점 상인";

  return (
    <section
      id="screen-buyer-summary"
      className="screen-panel active"
      aria-labelledby="heading-buyer-summary"
    >
      <div className="hybrid-card summary-container-card">
        <div className="summary-card-header">
          <div className="summary-tag-row">
            <span className="pill-badge primary">구매자 계정</span>
          </div>
          <h1 id="heading-buyer-summary" className="summary-heading">
            내 계정
          </h1>
          <p className="summary-subtext">내 계정 정보를 확인할 수 있습니다.</p>
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
                <tr>
                  <th scope="row">로그인 아이디</th>
                  <td id="userSummaryLoginId">{user.loginId}</td>
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
            <BuyerWithdrawalPanel onWithdrawn={onWithdrawn} onSessionExpired={onSessionExpired} />
          )}
        </div>
      </div>
    </section>
  );
}
