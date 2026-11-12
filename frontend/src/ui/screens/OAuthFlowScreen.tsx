import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import {
  getOAuthFlow,
  getOAuthProviders,
  linkOAuth,
  refreshAccessToken,
  signupOAuth,
  startOAuth,
} from "../../api/auth";
import { ApiError, type OAuthFlowResponse } from "../../api/types";
import { validateDisplayName, validateEmail } from "../../validation/signupValidation";
import { StatusAlert } from "../components/StatusAlert";

interface OAuthFlowScreenProps {
  onLoginSuccess: () => Promise<void> | void;
  onNavigateLogin: () => void;
  onReauthConfirmed: () => void;
}

/**
 * 고정 /#oauth 콜백 진입 처리 화면
 * GET /api/auth/oauth/flow 상태에 따라:
 * - LOGIN: refreshAccessToken 후 me 조회하여 로그인 완료, #oauth 해시 정리
 * - SIGNUP: 제공자 표시이름/이메일 프리필 및 확인·보완 후 가입
 * - LINK: 동일 이메일 기존 회원 연결
 *   - linkVerified === true: 소셜 재인증 증명 완료 상태로 동의/최종 연결 버튼만 노출
 *   - linkVerified !== true: 아이디/비밀번호 자격 증명 또는 활성 소셜 제공자 재인증 선택 (기존 계정 수단 미노출)
 * - REAUTH: 구매자 탈퇴용 소셜 재인증 확인 후 내 계정으로 복귀
 * - ERROR: 오류 안내 및 로그인 화면 복귀
 */
export function OAuthFlowScreen({
  onLoginSuccess,
  onNavigateLogin,
  onReauthConfirmed,
}: OAuthFlowScreenProps): ReactElement {
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<OAuthFlowResponse | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [linkReloadFailed, setLinkReloadFailed] = useState(false);
  const [reloadFailureFlow, setReloadFailureFlow] = useState(false);

  // SIGNUP 상태용 입력값
  const [signupDisplayName, setSignupDisplayName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupNameError, setSignupNameError] = useState<string | null>(null);
  const [signupEmailError, setSignupEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // LINK 상태용 입력값
  const [linkMode, setLinkMode] = useState<"local" | "social">("local");
  const [linkLoginId, setLinkLoginId] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkLoginIdError, setLinkLoginIdError] = useState<string | null>(null);
  const [linkPasswordError, setLinkPasswordError] = useState<string | null>(null);

  // StrictMode 중복 마운트 대응: effect는 두 번 실행되지만, 최초 조회 Promise를 ref에 공유하고
  // 각 effect는 자신의 active만 해제·등록한다. 둘째 setup이 같은 Promise 결과를 처리하므로 영구 loading에 빠지지 않는다.
  const flowPromiseRef = useRef<Promise<OAuthFlowResponse> | null>(null);
  const callbacksRef = useRef({ onLoginSuccess, onNavigateLogin, onReauthConfirmed });
  useEffect(() => {
    callbacksRef.current = { onLoginSuccess, onNavigateLogin, onReauthConfirmed };
  });

  useEffect(() => {
    let active = true;

    async function initFlow(): Promise<void> {
      try {
        if (!flowPromiseRef.current) {
          flowPromiseRef.current = getOAuthFlow();
        }
        const flowData = await flowPromiseRef.current;
        if (!active) return;
        setFlow(flowData);

        if (flowData.status === "LOGIN") {
          // 서버에 refresh 쿠키가 준비되어 있으므로 refresh 후 로그인 완료 처리
          await refreshAccessToken();
          if (!active) return;
          window.history.replaceState(null, "", "#");
          await callbacksRef.current.onLoginSuccess();
        } else if (flowData.status === "REAUTH") {
          // 탈퇴용 소셜 재인증 쿠키 확인 완료:
          // 새 문서 로드로 메모리 access 토큰이 없으므로 refresh로 세션을 복원한 뒤 탈퇴 확인으로 복귀
          await refreshAccessToken();
          if (!active) return;
          window.history.replaceState(null, "", "#account");
          await callbacksRef.current.onReauthConfirmed();
        } else if (flowData.status === "SIGNUP") {
          setSignupDisplayName(flowData.displayName || "");
          setSignupEmail(flowData.email || "");
          setLoading(false);
        } else if (flowData.status === "LINK") {
          try {
            const providers = await getOAuthProviders();
            if (active) setAvailableProviders(providers);
          } catch {
            // 제공자 목록을 못 얻어도 로컬 자격 증명 연결은 진행할 수 있다.
            if (active) setAvailableProviders([]);
          }
          if (!active) return;
          setLoading(false);
        } else {
          // ERROR 또는 알 수 없는 상태
          setAlertMessage(flowData.message || "소셜 로그인 처리 중 오류가 발생했습니다.");
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!active) return;
        setLoading(false);
        if (err instanceof ApiError) {
          setAlertMessage(err.message);
        } else {
          setAlertMessage("소셜 로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.");
        }
      }
    }

    void initFlow();

    return () => {
      active = false;
    };
  }, []);

  async function handleSignupSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAlertMessage(null);

    const nameErr = validateDisplayName(signupDisplayName);
    const emailErr = validateEmail(signupEmail);

    setSignupNameError(nameErr);
    setSignupEmailError(emailErr);

    if (nameErr || emailErr) {
      return;
    }

    setIsSubmitting(true);
    try {
      await signupOAuth(signupDisplayName, signupEmail);
      window.history.replaceState(null, "", "#");
      await callbacksRef.current.onLoginSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409 && err.code === "LINK_REQUIRED") {
        // 409 뒤 연결 화면 재조회가 실패해도 로딩이 남지 않도록 별도로 처리하고 재시도를 제공한다.
        // 실패 시 flow는 이전(SIGNUP) 상태로 남아 있으므로, 오류 화면이 가려지지 않도록 복구 실패 화면으로 전환한다.
        setAlertMessage(null);
        setLinkReloadFailed(false);
        setLoading(true);
        try {
          await goToLinkScreen();
        } catch (reloadError: unknown) {
          setReloadFailureFlow(true);
          setLinkReloadFailed(true);
          setAlertMessage(
            reloadError instanceof ApiError
              ? reloadError.message
              : "연결 화면을 불러오지 못했습니다. 다시 시도해 주세요.",
          );
        } finally {
          setLoading(false);
        }
        return;
      }
      if (err instanceof ApiError) {
        setAlertMessage(err.message);
      } else {
        setAlertMessage("소셜 회원가입 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 409 LINK_REQUIRED 뒤 새 흐름 쿠키로 연결 화면 상태를 다시 조회한다. */
  async function goToLinkScreen(): Promise<void> {
    const flowData = await getOAuthFlow();
    setFlow(flowData);
    if (flowData.status !== "LINK") {
      throw new ApiError(
        409,
        "LINK_REQUIRED",
        flowData.message || "연결 화면을 불러오지 못했습니다.",
      );
    }
    try {
      const providers = await getOAuthProviders();
      setAvailableProviders(providers);
    } catch {
      // 제공자 목록을 못 얻어도 로컬 자격 증명 연결은 진행할 수 있다.
      setAvailableProviders([]);
    }
    setLinkReloadFailed(false);
    setReloadFailureFlow(false);
    setAlertMessage(null);
  }

  /** 409 복구 재조회 재시도다. 실패하면 오류를 표시하고 로딩을 해제한다. */
  async function retryLinkReload(): Promise<void> {
    setLoading(true);
    setAlertMessage(null);
    setLinkReloadFailed(false);
    try {
      await goToLinkScreen();
    } catch (err: unknown) {
      setLinkReloadFailed(true);
      setAlertMessage(
        err instanceof ApiError
          ? err.message
          : "연결 화면을 불러오지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkLocalSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAlertMessage(null);

    let hasErr = false;
    if (!linkLoginId) {
      setLinkLoginIdError("아이디를 입력해 주세요.");
      hasErr = true;
    } else {
      setLinkLoginIdError(null);
    }
    if (!linkPassword) {
      setLinkPasswordError("비밀번호를 입력해 주세요.");
      hasErr = true;
    } else {
      setLinkPasswordError(null);
    }

    if (hasErr) return;

    setIsSubmitting(true);
    try {
      await linkOAuth({ confirm: true, loginId: linkLoginId, password: linkPassword });
      window.history.replaceState(null, "", "#");
      await callbacksRef.current.onLoginSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAlertMessage("기존 계정 아이디 또는 비밀번호가 일치하지 않습니다.");
        } else {
          setAlertMessage(err.message);
        }
      } else {
        setAlertMessage("계정 연결 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLinkVerifiedSubmit(): Promise<void> {
    setIsSubmitting(true);
    setAlertMessage(null);
    try {
      await linkOAuth({ confirm: true });
      window.history.replaceState(null, "", "#");
      await callbacksRef.current.onLoginSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAlertMessage(err.message);
      } else {
        setAlertMessage("계정 연결 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLinkSocialStart(provider: string): Promise<void> {
    setIsSubmitting(true);
    setAlertMessage(null);
    try {
      const response = await startOAuth(provider, "link");
      if (!response.authorizationUrl) {
        throw new Error("소셜 재인증 주소를 받지 못했습니다.");
      }
      window.location.assign(response.authorizationUrl);
    } catch (err: unknown) {
      setIsSubmitting(false);
      if (err instanceof ApiError) {
        setAlertMessage(err.message);
      } else {
        setAlertMessage("소셜 재인증을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    }
  }

  if (loading) {
    return (
      <section className="screen-panel active" aria-label="소셜 로그인 처리 중">
        <div
          className="hybrid-card summary-container-card"
          style={{
            maxWidth: "480px",
            margin: "40px auto",
            textAlign: "center",
            padding: "40px 24px",
          }}
        >
          <span
            className="spinner-icon"
            style={{
              display: "inline-block",
              width: "32px",
              height: "32px",
              borderColor: "var(--color-primary) transparent var(--color-primary) transparent",
            }}
            aria-hidden="true"
          />
          <h2 style={{ marginTop: "16px", fontSize: "17px", fontWeight: 700 }}>
            소셜 로그인 처리 중…
          </h2>
          <p style={{ marginTop: "8px", color: "var(--color-text-muted)", fontSize: "14px" }}>
            잠시만 기다려 주세요. 인증 상태를 확인하고 있습니다.
          </p>
        </div>
      </section>
    );
  }

  // SIGNUP 화면
  // 409 복구 재조회가 실패하면 이전 SIGNUP 화면이 오류/재시도를 가리지 않도록 전용 복구 화면을 보여 준다.
  if (reloadFailureFlow) {
    return (
      <section
        id="screen-oauth-error"
        className="screen-panel active"
        aria-labelledby="heading-oauth-error"
      >
        <div
          className="hybrid-card summary-container-card"
          style={{ maxWidth: "480px", margin: "40px auto" }}
        >
          <div className="summary-card-header">
            <div className="summary-tag-row">
              <span className="pill-badge cold">오류 안내</span>
            </div>
            <h1 id="heading-oauth-error" className="summary-heading">
              소셜 로그인 실패
            </h1>
            <p className="summary-subtext">연결 화면을 불러오지 못했습니다.</p>
          </div>

          <div className="summary-card-body">
            <StatusAlert
              id="oauthErrorAlert"
              message={alertMessage || "연결 화면을 불러오지 못했습니다. 다시 시도해 주세요."}
            />

            <div className="checkout-actions" style={{ marginTop: "20px" }}>
              <button
                type="button"
                id="btnOAuthRetryLink"
                className="btn-submit-primary"
                disabled={loading}
                onClick={() => void retryLinkReload()}
              >
                연결 화면 다시 불러오기
              </button>
              <button type="button" className="text-action-link" onClick={onNavigateLogin}>
                로그인 화면으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (flow?.status === "SIGNUP") {
    return (
      <section
        id="screen-oauth-signup"
        className="screen-panel active"
        aria-labelledby="heading-oauth-signup"
      >
        <div
          className="hybrid-card summary-container-card"
          style={{ maxWidth: "480px", margin: "40px auto" }}
        >
          <div className="summary-card-header">
            <div className="summary-tag-row">
              <span className="pill-badge primary">소셜 간편 가입</span>
            </div>
            <h1 id="heading-oauth-signup" className="summary-heading">
              소셜 회원가입
            </h1>
            <p className="summary-subtext">
              소셜 계정에서 가져온 정보를 확인하고 필요 시 수정해 주세요. 비밀번호 없이 안전하게
              가입됩니다.
            </p>
          </div>

          <div className="summary-card-body">
            <StatusAlert id="oauthSignupAlert" message={alertMessage} />

            <form className="market-form" noValidate onSubmit={(e) => void handleSignupSubmit(e)}>
              <div className="field-group">
                <label htmlFor="oauthDisplayName" className="field-label">
                  표시 이름{" "}
                  <span className="field-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  type="text"
                  id="oauthDisplayName"
                  className="input-box"
                  value={signupDisplayName}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setSignupDisplayName(e.target.value);
                    setSignupNameError(null);
                  }}
                  required
                />
                {signupNameError && (
                  <div className="field-error-msg" role="alert">
                    <span>{signupNameError}</span>
                  </div>
                )}
                <span className="field-help-text">한글·영문·숫자 2~10자</span>
              </div>

              <div className="field-group">
                <label htmlFor="oauthEmail" className="field-label">
                  이메일 주소{" "}
                  <span className="field-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  type="email"
                  id="oauthEmail"
                  className="input-box"
                  value={signupEmail}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setSignupEmail(e.target.value);
                    setSignupEmailError(null);
                  }}
                  required
                />
                {signupEmailError && (
                  <div className="field-error-msg" role="alert">
                    <span>{signupEmailError}</span>
                  </div>
                )}
                <span className="field-help-text">주요 안내를 전달받을 이메일 주소입니다.</span>
              </div>

              <div className="checkout-actions" style={{ marginTop: "24px" }}>
                <button
                  type="button"
                  className="text-action-link"
                  disabled={isSubmitting}
                  onClick={onNavigateLogin}
                >
                  취소
                </button>
                <button
                  type="submit"
                  id="btnOAuthSignupSubmit"
                  className={`btn-submit-primary ${isSubmitting ? "is-loading" : ""}`}
                  disabled={isSubmitting}
                >
                  <span className="btn-text">{isSubmitting ? "가입 처리 중…" : "가입 완료"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    );
  }

  // LINK 화면 (동일 이메일 기존 회원 연결)
  // 보안 규칙: 기존 계정 소유 확인 전 기존 로그인 ID·가입 방식·역할을 노출하지 않습니다.
  if (flow?.status === "LINK") {
    // 1) 소셜 재인증 증명이 이미 완료된 경우 (linkVerified === true)
    if (flow.linkVerified) {
      return (
        <section
          id="screen-oauth-link-verified"
          className="screen-panel active"
          aria-labelledby="heading-oauth-link-verified"
        >
          <div
            className="hybrid-card summary-container-card"
            style={{ maxWidth: "480px", margin: "40px auto" }}
          >
            <div className="summary-card-header">
              <div className="summary-tag-row">
                <span className="pill-badge primary">소셜 재인증 완료</span>
              </div>
              <h1 id="heading-oauth-link-verified" className="summary-heading">
                계정 연결 동의
              </h1>
              <p className="summary-subtext">
                기존 소셜 계정으로 본인 확인이 완료되었습니다. 아래 버튼을 눌러 계정 연결을 확정해
                주세요.
              </p>
            </div>

            <div className="summary-card-body">
              <StatusAlert id="oauthLinkAlert" message={alertMessage} />

              <div className="checkout-actions" style={{ marginTop: "24px" }}>
                <button
                  type="button"
                  className="text-action-link"
                  disabled={isSubmitting}
                  onClick={onNavigateLogin}
                >
                  취소
                </button>
                <button
                  type="button"
                  id="btnOAuthLinkConfirm"
                  className={`btn-submit-primary ${isSubmitting ? "is-loading" : ""}`}
                  disabled={isSubmitting}
                  onClick={() => void handleLinkVerifiedSubmit()}
                >
                  <span className="btn-text">
                    {isSubmitting ? "연결 처리 중…" : "계정 연결 동의 및 완료"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
      );
    }

    // 2) 소셜 재인증 증명 전인 경우: ID/PW 자격 증명 또는 활성 소셜 제공자 재인증 선택
    return (
      <section
        id="screen-oauth-link"
        className="screen-panel active"
        aria-labelledby="heading-oauth-link"
      >
        <div
          className="hybrid-card summary-container-card"
          style={{ maxWidth: "480px", margin: "40px auto" }}
        >
          <div className="summary-card-header">
            <div className="summary-tag-row">
              <span className="pill-badge warm">계정 연결 안내</span>
            </div>
            <h1 id="heading-oauth-link" className="summary-heading">
              기존 계정 연결
            </h1>
            <p className="summary-subtext">
              동일한 이메일 주소로 등록된 기존 계정이 있습니다. 계정 소유 확인 후 소셜 로그인
              수단으로 안전하게 연결할 수 있습니다.
            </p>
          </div>

          <div className="summary-card-body">
            <StatusAlert id="oauthLinkAlert" message={alertMessage} />

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                className={`tag-chip ${linkMode === "local" ? "active" : ""}`}
                onClick={() => setLinkMode("local")}
              >
                아이디/비밀번호로 연결
              </button>
              {availableProviders.length > 0 && (
                <button
                  type="button"
                  className={`tag-chip ${linkMode === "social" ? "active" : ""}`}
                  onClick={() => setLinkMode("social")}
                >
                  소셜 재인증으로 연결
                </button>
              )}
            </div>

            {linkMode === "local" ? (
              <form
                className="market-form"
                noValidate
                onSubmit={(e) => void handleLinkLocalSubmit(e)}
              >
                <div className="field-group">
                  <label htmlFor="linkLoginId" className="field-label">
                    기존 계정 아이디{" "}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    type="text"
                    id="linkLoginId"
                    className="input-box"
                    autoComplete="username"
                    value={linkLoginId}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setLinkLoginId(e.target.value);
                      setLinkLoginIdError(null);
                    }}
                    required
                  />
                  {linkLoginIdError && (
                    <div className="field-error-msg" role="alert">
                      <span>{linkLoginIdError}</span>
                    </div>
                  )}
                </div>

                <div className="field-group">
                  <label htmlFor="linkPassword" className="field-label">
                    기존 계정 비밀번호{" "}
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    type="password"
                    id="linkPassword"
                    className="input-box"
                    autoComplete="current-password"
                    value={linkPassword}
                    disabled={isSubmitting}
                    onChange={(e) => {
                      setLinkPassword(e.target.value);
                      setLinkPasswordError(null);
                    }}
                    required
                  />
                  {linkPasswordError && (
                    <div className="field-error-msg" role="alert">
                      <span>{linkPasswordError}</span>
                    </div>
                  )}
                </div>

                <div className="checkout-actions" style={{ marginTop: "24px" }}>
                  <button
                    type="button"
                    className="text-action-link"
                    disabled={isSubmitting}
                    onClick={onNavigateLogin}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    id="btnOAuthLinkSubmit"
                    className={`btn-submit-primary ${isSubmitting ? "is-loading" : ""}`}
                    disabled={isSubmitting}
                  >
                    <span className="btn-text">{isSubmitting ? "연결 중…" : "인증하고 연결"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--color-text-muted)",
                    marginBottom: "16px",
                  }}
                >
                  기존에 가입된 소셜 계정으로 본인 인증을 진행하여 새 소셜 로그인 수단을 추가합니다.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {availableProviders.includes("kakao") && (
                    <button
                      type="button"
                      className="btn-oauth btn-oauth-kakao"
                      disabled={isSubmitting}
                      onClick={() => void handleLinkSocialStart("kakao")}
                    >
                      카카오 계정으로 본인 인증
                    </button>
                  )}
                  {availableProviders.includes("google") && (
                    <button
                      type="button"
                      className="btn-oauth btn-oauth-google"
                      disabled={isSubmitting}
                      onClick={() => void handleLinkSocialStart("google")}
                    >
                      구글 계정으로 본인 인증
                    </button>
                  )}
                </div>
                <div className="checkout-actions" style={{ marginTop: "20px" }}>
                  <button
                    type="button"
                    className="text-action-link"
                    disabled={isSubmitting}
                    onClick={onNavigateLogin}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ERROR 또는 알 수 없는 상태
  return (
    <section
      id="screen-oauth-error"
      className="screen-panel active"
      aria-labelledby="heading-oauth-error"
    >
      <div
        className="hybrid-card summary-container-card"
        style={{ maxWidth: "480px", margin: "40px auto" }}
      >
        <div className="summary-card-header">
          <div className="summary-tag-row">
            <span className="pill-badge cold">오류 안내</span>
          </div>
          <h1 id="heading-oauth-error" className="summary-heading">
            소셜 로그인 실패
          </h1>
          <p className="summary-subtext">소셜 로그인 처리를 완료하지 못했습니다.</p>
        </div>

        <div className="summary-card-body">
          <StatusAlert
            id="oauthErrorAlert"
            message={alertMessage || "알 수 없는 오류가 발생했습니다."}
          />

          <div className="checkout-actions" style={{ marginTop: "20px" }}>
            {linkReloadFailed && (
              <button
                type="button"
                id="btnOAuthRetryLink"
                className="btn-submit-primary"
                disabled={loading}
                onClick={() => void retryLinkReload()}
              >
                연결 화면 다시 불러오기
              </button>
            )}
            <button type="button" className="text-action-link" onClick={onNavigateLogin}>
              로그인 화면으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
