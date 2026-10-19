import { useState, type FormEvent, type ReactElement } from "react";
import { login } from "../../api/auth";
import { ApiError } from "../../api/types";
import { BrandIntroPanel } from "../components/BrandIntroPanel";
import { StatusAlert } from "../components/StatusAlert";

interface LoginScreenProps {
  initialLoginId?: string;
  onLoginSuccess: () => Promise<void> | void;
  onNavigateSignup: () => void;
  sessionExpiredMessage?: string | null;
  syncErrorMessage?: string | null;
  onRetrySync?: () => void;
}

/**
 * 로그인 화면 (구매자/입점 상인 공용)
 * 데스크톱 40:60 스플릿 레이아웃, 모바일 390px 폼 우선 배치
 */
export function LoginScreen({
  initialLoginId = "",
  onLoginSuccess,
  onNavigateSignup,
  sessionExpiredMessage = null,
  syncErrorMessage = null,
  onRetrySync,
}: LoginScreenProps): ReactElement {
  const [loginId, setLoginId] = useState<string>(initialLoginId);
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [idError, setIdError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverAlert, setServerAlert] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setServerAlert(null);

    let hasError = false;

    // 비밀번호 및 아이디는 절대 임의 trim하지 않습니다.
    if (!loginId) {
      setIdError("아이디를 입력해 주세요.");
      hasError = true;
    } else {
      setIdError(null);
    }

    if (!password) {
      setPasswordError("비밀번호를 입력해 주세요.");
      hasError = true;
    } else {
      setPasswordError(null);
    }

    if (hasError) {
      return;
    }

    setIsLoading(true);

    try {
      await login(loginId, password);
      await onLoginSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setServerAlert("아이디 또는 비밀번호가 일치하지 않습니다. 다시 확인해 주세요.");
        } else if (err.status === 403) {
          setServerAlert("보안 토큰이 만료되었거나 접근이 거부되었습니다. 다시 시도해 주세요.");
        } else {
          setServerAlert(err.message);
        }
      } else {
        setServerAlert("네트워크 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  const activeAlert = serverAlert || syncErrorMessage || sessionExpiredMessage;

  return (
    <section id="screen-login" className="screen-panel active" aria-labelledby="heading-login">
      <div className="hybrid-card split-card">
        <BrandIntroPanel
          servicePill="미리내 마켓 · 방문 수령"
          sealText="미리내인"
          headline="미리 장보고, 오늘 시장에서 만나요"
          subtext="동네 상인들의 정성이 담긴 신선한 식재료를 기다림 없이 매장에서 직접 수령하세요."
          steps={[
            {
              number: 1,
              title: "당일 장보기 예약",
              desc: "원하는 시장 상품을 미리 간편하게 지정",
            },
            {
              number: 2,
              title: "익일 상인 직접 준비",
              desc: "가장 신선한 상태로 정성껏 포장 및 보관",
            },
            {
              number: 3,
              title: "매장 방문 직접 수령",
              desc: "대기 없이 매장에서 친근하게 바로 픽업",
            },
          ]}
          footerNote="지역 상인과 동네 이웃을 잇는 따뜻한 장보기"
          variant="shop"
        />

        <div className="form-card-panel">
          <div className="form-header-area">
            <h2 id="heading-login" className="form-title-heading">
              로그인
            </h2>
            <p className="form-desc-text">
              구매자와 매장 상인 모두 등록된 계정으로 이용하실 수 있습니다.
            </p>
          </div>

          <StatusAlert
            id="loginAlertBox"
            message={activeAlert}
            onRetry={syncErrorMessage && onRetrySync ? onRetrySync : undefined}
          />

          <form
            id="formLogin"
            className="market-form"
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
          >
            {/* 아이디 필드 */}
            <div className="field-group">
              <label htmlFor="loginUserId" className="field-label">
                아이디{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type="text"
                id="loginUserId"
                className="input-box"
                placeholder="아이디 입력"
                autoComplete="username"
                value={loginId}
                aria-invalid={idError ? "true" : "false"}
                aria-describedby={idError ? "loginUserIdError" : undefined}
                disabled={isLoading}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  setIdError(null);
                  setServerAlert(null);
                }}
                required
              />
              {idError && (
                <div id="loginUserIdError" className="field-error-msg" role="alert">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{idError}</span>
                </div>
              )}
            </div>

            {/* 비밀번호 필드 */}
            <div className="field-group">
              <label htmlFor="loginPassword" className="field-label">
                비밀번호{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  id="loginPassword"
                  className="input-box"
                  placeholder="비밀번호 입력"
                  autoComplete="current-password"
                  value={password}
                  aria-invalid={passwordError ? "true" : "false"}
                  aria-describedby={passwordError ? "loginPasswordError" : undefined}
                  disabled={isLoading}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                    setServerAlert(null);
                  }}
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-visibility"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <svg
                      className="icon-eye-closed"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      className="icon-eye-open"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <div id="loginPasswordError" className="field-error-msg" role="alert">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{passwordError}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              id="btnLoginSubmit"
              className={`btn-submit-primary ${isLoading ? "is-loading" : ""}`}
              disabled={isLoading}
            >
              {isLoading && <span className="spinner-icon" aria-hidden="true" />}
              <span className="btn-text">{isLoading ? "로그인 중..." : "로그인"}</span>
            </button>
          </form>

          <div className="form-footer-navigation">
            <span>아직 미리내 마켓 회원이 아니신가요?</span>
            <button type="button" className="text-action-link" onClick={onNavigateSignup}>
              구매자 회원가입하기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
