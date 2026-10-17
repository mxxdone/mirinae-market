import { useEffect, useState, type ReactElement } from "react";
import { getCurrentSellerStore } from "../../api/store";
import { ApiError, type StoreView, type UserMe } from "../../api/types";
import { SellerProfilePanel } from "../components/SellerProfilePanel";
import { SellerProductsPanel } from "../components/SellerProductsPanel";
import { StatusAlert } from "../components/StatusAlert";
import {
  isSellerLocation,
  readSellerPage,
  writeSellerPage,
  type SellerPage,
  readProductPage,
  writeProductPage,
} from "../sellerLocation";

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
  const [location, setLocation] = useState(() => window.location.hash);
  const [salesLocation, setSalesLocation] = useState(() =>
    readSellerPage() === "store" ? "#seller" : window.location.hash,
  );
  const page = readSellerPage(location);

  useEffect(() => {
    if (!isSellerLocation()) writeSellerPage("sales", false);
    function restorePage() {
      const next = window.location.hash;
      setLocation(next);
      if (readSellerPage(next) === "sales") setSalesLocation(next);
    }
    window.addEventListener("popstate", restorePage);
    window.addEventListener("hashchange", restorePage);
    return () => {
      window.removeEventListener("popstate", restorePage);
      window.removeEventListener("hashchange", restorePage);
    };
  }, []);

  function navigate(next: SellerPage) {
    if (next === "sales" && page === "store") writeProductPage(readProductPage(salesLocation));
    else writeSellerPage(next);
    setLocation(window.location.hash);
    if (next === "sales") setSalesLocation(window.location.hash);
  }

  function navigateProduct(id: number | "new" | null) {
    writeProductPage(id);
    setLocation(window.location.hash);
    setSalesLocation(window.location.hash);
  }

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
        <header className="seller-workspace-header">
          <h1 id="heading-seller-store">{store ? store.name : "내 매장"}</h1>
          <nav className="seller-workspace-navigation" aria-label="매장 메뉴">
            <a
              href="#seller"
              aria-current={page === "sales" ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate("sales");
              }}
            >
              판매 관리
            </a>
            <a
              href="#seller/store"
              aria-current={page === "store" ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate("store");
              }}
            >
              매장 정보
            </a>
            <button
              type="button"
              id="btnLogoutSeller"
              className="btn-logout"
              disabled={isLoggingOut}
              onClick={() => void onLogout()}
            >
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </button>
          </nav>
        </header>

        <div className="summary-card-body">
          {page === "store" && (
            <button
              type="button"
              id="btnRefreshStore"
              className="btn-query-store"
              disabled={isLoading}
              onClick={() => setRefreshVersion((version) => version + 1)}
            >
              {isLoading ? "매장 정보를 불러오는 중..." : "매장 정보 새로고침"}
            </button>
          )}
          {isLoading && <p role="status">담당 매장 정보를 불러오고 있습니다.</p>}
          <StatusAlert
            id="storeAlertBox"
            message={errorAlert}
            onRetry={() => setRefreshVersion((version) => version + 1)}
          />

          {/* 실제 매장 정보 테이블 (조회 성공 시 노출) */}
          {page === "store" && store && (
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

          {page === "store" && store && <SellerProfilePanel onSessionExpired={onSessionExpired} />}

          {store && (
            <div hidden={page !== "sales"}>
              <SellerProductsPanel
                key={store.id}
                store={store}
                onSessionExpired={onSessionExpired}
                editorId={readProductPage(salesLocation)}
                onProductPage={navigateProduct}
              />
            </div>
          )}

          {/* 로그아웃 실패 시 인라인 오류 배너 (role="alert", 재시도 가능) */}
          <StatusAlert
            id="sellerLogoutAlert"
            message={logoutError}
            onRetry={() => void onLogout()}
          />
        </div>
      </div>
    </section>
  );
}
