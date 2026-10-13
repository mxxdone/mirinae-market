import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { getMe, logout } from "../api/auth";
import { ApiError, type UserMe } from "../api/types";
import { HealthBadge } from "./components/HealthBadge";
import { Toast } from "./components/Toast";
import { BuyerSummaryScreen } from "./screens/BuyerSummaryScreen";
import { BuyerMarketContainer } from "./screens/BuyerMarketContainer";
import { LoginScreen } from "./screens/LoginScreen";
import { SellerStoreScreen } from "./screens/SellerStoreScreen";
import { SignupCompleteScreen } from "./screens/SignupCompleteScreen";
import { SignupScreen } from "./screens/SignupScreen";
import { isMarketLocation, leaveMarketLocation, writeMarketLocation } from "./marketLocation";
import { isSellerLocation } from "./sellerLocation";

export type ScreenId =
  "login" | "signup" | "signup-complete" | "buyer-summary" | "seller-store" | "buyer-market";

/**
 * 미리내 마켓 프런트엔드 애플리케이션 최상위 UI 컴포넌트
 * 세션 상태 관리, 라우팅, 비동기 응답 순서 보장, 개인정보 수명주기 관리
 */
export function App(): ReactElement {
  const [currentUser, setCurrentUser] = useState<UserMe | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenId>("login");
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [registeredLoginId, setRegisteredLoginId] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  // 비동기 요청 경합 방지용 카운터 (오래된 응답 덮어쓰기 방지)
  const requestIdRef = useRef<number>(0);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string): void => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  /**
   * 세션 정보 동기화 (로그인 후 호출)
   */
  async function syncCurrentUser(): Promise<void> {
    const currentReqId = ++requestIdRef.current;
    setSyncErrorMessage(null);
    try {
      const me = await getMe();
      if (currentReqId !== requestIdRef.current) return;
      setCurrentUser(me);
      setSessionExpiredMessage(null);
      setSyncErrorMessage(null);
      setLogoutError(null);
      showToast("로그인되었습니다.");

      // 사용자 역할에 따른 화면 이동
      if (me.role === "SELLER") {
        setCurrentScreen("seller-store");
      } else {
        setCurrentScreen(isMarketLocation() ? "buyer-market" : "buyer-summary");
      }
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current) return;
      setCurrentUser(null);
      if (err instanceof ApiError && err.status === 401) {
        setSessionExpiredMessage("인증 세션을 확인할 수 없습니다. 다시 로그인해 주세요.");
      } else if (err instanceof ApiError) {
        setSyncErrorMessage(err.message || "계정 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
      } else {
        setSyncErrorMessage(
          "로그인은 완료되었으나 계정 정보를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.",
        );
      }
      throw err;
    }
  }

  // 컴포넌트 최초 마운트 시 세션 복원
  useEffect(() => {
    let isMounted = true;
    const currentReqId = ++requestIdRef.current;

    async function restoreInitialSession(): Promise<void> {
      try {
        const me = await getMe();
        if (!isMounted || currentReqId !== requestIdRef.current) return;
        setCurrentUser(me);
        if (me.role === "SELLER") {
          setCurrentScreen("seller-store");
        } else {
          setCurrentScreen(isMarketLocation() ? "buyer-market" : "buyer-summary");
        }
      } catch {
        if (!isMounted || currentReqId !== requestIdRef.current) return;
        setCurrentUser(null);
        setCurrentScreen("login");
      } finally {
        if (isMounted && currentReqId === requestIdRef.current) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreInitialSession();

    return () => {
      isMounted = false;
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "BUYER") return;
    function restoreScreen() {
      setCurrentScreen(isMarketLocation() ? "buyer-market" : "buyer-summary");
    }
    window.addEventListener("popstate", restoreScreen);
    return () => window.removeEventListener("popstate", restoreScreen);
  }, [currentUser]);

  useEffect(() => {
    if (
      !isRestoringSession &&
      !currentUser &&
      currentScreen === "login" &&
      (isMarketLocation() || isSellerLocation())
    ) {
      leaveMarketLocation();
    }
  }, [isRestoringSession, currentUser, currentScreen]);

  /**
   * 로그아웃 처리
   * 실제 성공(204) 또는 이미 만료(401)일 때만 개인정보를 폐기합니다.
   * 네트워크 통신 실패 또는 403일 때는 계정 화면을 유지하며 한국어 오류 및 재시도를 제공합니다.
   */
  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      // 성공 204: 개인정보 폐기 및 로그인 화면 전환
      ++requestIdRef.current;
      setCurrentUser(null);
      setLogoutError(null);
      showToast("안전하게 로그아웃되었습니다.");
      setCurrentScreen("login");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        // 이미 서버 세션이 만료된 경우: 개인정보 폐기 및 로그인 안내
        ++requestIdRef.current;
        setCurrentUser(null);
        setLogoutError(null);
        setSessionExpiredMessage("로그인 세션이 이미 만료되어 로그아웃 처리되었습니다.");
        setCurrentScreen("login");
        showToast("세션이 만료되었습니다.");
      } else {
        // 네트워크 실패(오프라인, 타임아웃) 또는 403 등: 서버 세션 유효 가능성으로 계정 정보 유지
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setLogoutError(
              "보안 토큰이 만료되었거나 로그아웃 권한이 없습니다. 다시 시도해 주세요.",
            );
          } else {
            setLogoutError(
              err.message || "로그아웃 요청을 전송하지 못했습니다. 다시 시도해 주세요.",
            );
          }
        } else {
          setLogoutError(
            "로그아웃 요청을 전송하지 못했습니다. 네트워크 연결 상태를 확인하고 다시 시도해 주세요.",
          );
        }
      }
    } finally {
      setIsLoggingOut(false);
    }
  }

  /**
   * 보호 자원 접근 중 401 발생 시 개인/매장 정보 폐기 및 로그인 안내
   */
  const handleSessionExpired = useCallback((): void => {
    ++requestIdRef.current;
    setCurrentUser(null);
    setSessionExpiredMessage("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
    setCurrentScreen("login");
    showToast("세션이 만료되어 로그인 화면으로 이동합니다.");
  }, [showToast]);

  /**
   * 회원가입 성공 처리 (자동 로그인 없음, 로그인 아이디 인계 가능)
   */
  function handleSignupSuccess(newLoginId: string): void {
    setRegisteredLoginId(newLoginId);
    setCurrentScreen("signup-complete");
    showToast("단골손님 등록이 완료되었습니다.");
  }

  if (isRestoringSession) {
    return (
      <div
        className="app-container"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          <span
            className="spinner-icon"
            style={{
              display: "inline-block",
              width: "24px",
              height: "24px",
              borderColor: "var(--color-primary) transparent var(--color-primary) transparent",
            }}
            aria-hidden="true"
          />
          <p style={{ marginTop: "12px", fontSize: "14px", fontWeight: 600 }}>세션 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <main className="main-viewport" id="mainViewport">
        <div className="screen-container">
          {currentScreen === "login" && (
            <LoginScreen
              initialLoginId={registeredLoginId}
              sessionExpiredMessage={sessionExpiredMessage}
              syncErrorMessage={syncErrorMessage}
              onRetrySync={() => void syncCurrentUser()}
              onLoginSuccess={async () => {
                await syncCurrentUser();
              }}
              onNavigateSignup={() => {
                setSessionExpiredMessage(null);
                setSyncErrorMessage(null);
                setCurrentScreen("signup");
              }}
            />
          )}

          {currentScreen === "signup" && (
            <SignupScreen
              onSignupSuccess={handleSignupSuccess}
              onNavigateLogin={() => {
                setSessionExpiredMessage(null);
                setSyncErrorMessage(null);
                setCurrentScreen("login");
              }}
            />
          )}

          {currentScreen === "signup-complete" && (
            <SignupCompleteScreen
              loginId={registeredLoginId}
              onNavigateLogin={() => {
                setCurrentScreen("login");
              }}
            />
          )}

          {currentScreen === "buyer-summary" && currentUser && (
            <BuyerSummaryScreen
              onBrowse={() => {
                writeMarketLocation({ marketId: null, query: "", page: 0, offerId: null }, true);
                setCurrentScreen("buyer-market");
              }}
              user={currentUser}
              isLoggingOut={isLoggingOut}
              logoutError={logoutError}
              onLogout={() => void handleLogout()}
            />
          )}

          {currentScreen === "buyer-market" && currentUser && (
            <BuyerMarketContainer
              key={currentUser.id}
              onAccount={() => {
                leaveMarketLocation(true);
                setCurrentScreen("buyer-summary");
              }}
              onSessionExpired={handleSessionExpired}
            />
          )}

          {currentScreen === "seller-store" && currentUser && (
            <SellerStoreScreen
              user={currentUser}
              isLoggingOut={isLoggingOut}
              logoutError={logoutError}
              onLogout={() => void handleLogout()}
              onSessionExpired={handleSessionExpired}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <HealthBadge />
        <span>미리내 마켓 · 동네 시장 예약 방문 수령</span>
      </footer>

      <Toast message={toastMessage} />
    </div>
  );
}
