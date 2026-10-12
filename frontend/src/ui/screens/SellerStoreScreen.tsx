import { useEffect, useState, type ReactElement } from "react";
import { getCurrentSellerStore } from "../../api/store";
import { ApiError, type StoreView, type UserMe } from "../../api/types";
import { SellerProductsPanel } from "../components/SellerProductsPanel";
import { StatusAlert } from "../components/StatusAlert";

interface SellerStoreScreenProps {
  user: UserMe;
  onLogout: () => Promise<void> | void;
  onSessionExpired: () => void;
  isLoggingOut?: boolean;
  logoutError?: string | null;
}

/**
 * 판매자 본인 매장 화면
 * 담당 매장은 서버 세션으로 자동 조회하며 URL이나 사용자 입력으로 선택하지 않습니다.
 */
export function SellerStoreScreen({
  user,
  onLogout,
  onSessionExpired,
  isLoggingOut = false,
  logoutError = null,
}: SellerStoreScreenProps): ReactElement {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [store, setStore] = useState<StoreView | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStore(null);
    setIsLoading(true);
    setErrorAlert(null);

    async function loadStore(): Promise<void> {
      try {
        const data = await getCurrentSellerStore();
        if (active) setStore(data);
      } catch (err: unknown) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          onSessionExpired();
        } else if (err instanceof ApiError && err.status === 403) {
          setErrorAlert("담당 매장을 확인할 수 없습니다. 매장 등록 상태를 확인해 주세요.");
        } else if (err instanceof ApiError) {
          setErrorAlert(err.message);
        } else {
          setErrorAlert(
            "매장 정보를 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadStore();
    return () => {
      // 로그아웃·계정 변경·재조회 이후에는 이전 응답을 화면에 반영하지 않습니다.
      active = false;
    };
  }, [user.id, refreshVersion, onSessionExpired]);

  return (
    <section
      id="screen-seller-store"
      className="screen-panel active"
      aria-labelledby="heading-seller-store"
    >
      <div className="hybrid-card summary-container-card seller-workspace">
        {/* 상단 헤더 배너 */}
        <div className="seller-header-banner">
          <div className="summary-tag-row">
            <span className="seller-location-pill">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{store ? `시장 ID: ${store.marketId}` : "담당 매장"}</span>
            </span>
            <span
              className="pill-badge"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.25)",
              }}
            >
              입점 상인
            </span>
          </div>
          <h1 id="heading-seller-store" className="seller-store-name">
            {store ? store.name : "내 매장"}
          </h1>
          <p className="seller-store-intro">{user.displayName} 님의 담당 매장입니다.</p>
        </div>

        <div className="summary-card-body">
          <button
            type="button"
            id="btnRefreshStore"
            className="btn-query-store"
            disabled={isLoading}
            onClick={() => setRefreshVersion((version) => version + 1)}
          >
            {isLoading ? "매장 정보를 불러오는 중..." : "매장 정보 새로고침"}
          </button>
          {isLoading && <p role="status">담당 매장 정보를 불러오고 있습니다.</p>}
          <StatusAlert
            id="storeAlertBox"
            message={errorAlert}
            onRetry={() => setRefreshVersion((version) => version + 1)}
          />

          {/* 실제 매장 정보 테이블 (조회 성공 시 노출) */}
          {store && (
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
                  매장 상세 정보
                </caption>
                <tbody>
                  <tr>
                    <th scope="row">매장 번호 (ID)</th>
                    <td id="storeInfoId">{store.id}</td>
                  </tr>
                  <tr>
                    <th scope="row">매장명</th>
                    <td id="storeInfoName">{store.name}</td>
                  </tr>
                  <tr>
                    <th scope="row">소속 시장 번호</th>
                    <td id="storeInfoMarketId">{store.marketId}</td>
                  </tr>
                  <tr>
                    <th scope="row">계정 표시 이름</th>
                    <td id="storeInfoDisplayName">{user.displayName}</td>
                  </tr>
                  <tr>
                    <th scope="row">계정 역할</th>
                    <td id="storeInfoRole">
                      <span className="role-highlight-text">
                        {user.role === "SELLER" ? "입점 상인" : "구매자"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {store && (
            <SellerProductsPanel key={store.id} store={store} onSessionExpired={onSessionExpired} />
          )}

          {/* 로그아웃 실패 시 인라인 오류 배너 (role="alert", 재시도 가능) */}
          <StatusAlert
            id="sellerLogoutAlert"
            message={logoutError}
            onRetry={() => void onLogout()}
          />

          {/* 계정 보안 및 로그아웃 */}
          <div className="logout-action-box">
            <div>
              <div className="logout-info-title">상인 계정 관리</div>
              <div className="logout-info-desc">
                매장 업무를 마친 후 안전하게 로그아웃할 수 있습니다.
              </div>
            </div>
            <button
              type="button"
              id="btnLogoutSeller"
              className="btn-logout"
              disabled={isLoggingOut}
              onClick={() => void onLogout()}
            >
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
