import { useState, type FormEvent, type ReactElement } from "react";
import { signup } from "../../api/accounts";
import { ApiError } from "../../api/types";
import {
  validateDisplayName,
  validateEmail,
  validateLoginId,
  validatePassword,
} from "../../validation/signupValidation";
import { BrandIntroPanel } from "../components/BrandIntroPanel";
import { StatusAlert } from "../components/StatusAlert";

interface SignupScreenProps {
  onSignupSuccess: (loginId: string) => void;
  onNavigateLogin: () => void;
}

/**
 * 구매자 회원가입 화면 (4필드: 아이디, 이메일, 표시이름, 비밀번호)
 * 임의의 trim/정규화 금지 원칙 준수
 */
export function SignupScreen({
  onSignupSuccess,
  onNavigateLogin,
}: SignupScreenProps): ReactElement {
  const [loginId, setLoginId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [idError, setIdError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [serverAlert, setServerAlert] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setServerAlert(null);

    // 클라이언트 정밀 검증
    const errId = validateLoginId(loginId);
    const errEmail = validateEmail(email);
    const errName = validateDisplayName(displayName);
    const errPw = validatePassword(password);

    setIdError(errId);
    setEmailError(errEmail);
    setNameError(errName);
    setPasswordError(errPw);

    if (errId || errEmail || errName || errPw) {
      return;
    }

    setIsLoading(true);

    try {
      // 서버는 email에 대해서만 trim 및 소문자화를 수행하므로 ID/PW/Name은 원형 유지
      await signup({
        loginId,
        email,
        displayName,
        password,
      });

      // 가입 성공: 비밀번호는 즉시 비우고 완료 화면으로 이동 (자동 로그인 없음)
      setPassword("");
      onSignupSuccess(loginId);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setServerAlert(err.message || "이미 등록된 아이디 또는 이메일입니다.");
        } else if (err.status === 400) {
          setServerAlert(err.message || "입력 정보가 올바르지 않습니다. 다시 확인해 주세요.");
        } else if (err.status === 403) {
          setServerAlert("보안 토큰이 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.");
        } else {
          setServerAlert(err.message);
        }
      } else {
        setServerAlert("가입 처리 중 통신 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section id="screen-signup" className="screen-panel active" aria-labelledby="heading-signup">
      <div className="hybrid-card split-card">
        <BrandIntroPanel
          servicePill="단골 손님 등록"
          sealText="단골등록"
          headline="매일 찾는 동네 시장, 든든한 단골손님이 되어보세요"
          subtext="복잡한 절차 없이 꼭 필요한 4가지 정보로 편리한 예약 방문 수령을 시작합니다."
          steps={[
            {
              number: "✓",
              title: "최소한의 필수 정보만 수집",
              desc: "예약 식별과 매장 호칭에 필요한 4가지 항목만 입력합니다.",
            },
            {
              number: "✓",
              title: "안전한 계정 관리 원칙",
              desc: "가입 완료 후에도 자동 로그인 없이 직접 로그인하여 안전합니다.",
            },
          ]}
          footerNote="동네 이웃과 시장 상인의 신뢰를 잇는 장보기"
          variant="basket"
        />

        <div className="form-card-panel">
          <div className="form-header-area">
            <h2 id="heading-signup" className="form-title-heading">
              구매자 회원가입
            </h2>
            <p className="form-desc-text">
              내일 수령할 시장 상품 예약을 위해 기본 정보를 입력해 주세요.
            </p>
          </div>

          <StatusAlert id="signupAlertBox" message={serverAlert} />

          <form
            id="formSignup"
            className="market-form"
            noValidate
            onSubmit={(e) => void handleSubmit(e)}
          >
            {/* 1. 로그인 아이디 */}
            <div className="field-group">
              <label htmlFor="signupUserId" className="field-label">
                로그인 아이디{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type="text"
                id="signupUserId"
                className="input-box"
                placeholder="영문 소문자·숫자·_·- 5~20자"
                autoComplete="username"
                value={loginId}
                aria-invalid={idError ? "true" : "false"}
                aria-describedby={idError ? "signupUserIdError" : undefined}
                disabled={isLoading}
                onChange={(e) => {
                  setLoginId(e.target.value);
                  setIdError(null);
                  setServerAlert(null);
                }}
                required
              />
              {idError && (
                <div id="signupUserIdError" className="field-error-msg" role="alert">
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

            {/* 2. 이메일 주소 */}
            <div className="field-group">
              <label htmlFor="signupEmail" className="field-label">
                이메일 주소{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type="email"
                id="signupEmail"
                className="input-box"
                placeholder="이메일 주소 (예: user@example.com)"
                autoComplete="email"
                value={email}
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "signupEmailError" : undefined}
                disabled={isLoading}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                  setServerAlert(null);
                }}
                required
              />
              {emailError && (
                <div id="signupEmailError" className="field-error-msg" role="alert">
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
                  <span>{emailError}</span>
                </div>
              )}
              <p className="field-help-text">계정에 연결할 이메일 주소를 입력해 주세요.</p>
            </div>

            {/* 3. 표시 이름 */}
            <div className="field-group">
              <label htmlFor="signupName" className="field-label">
                표시 이름 (수령 시 호칭){" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type="text"
                id="signupName"
                className="input-box"
                placeholder="매장에서 불릴 이름 (예: 김단골)"
                autoComplete="nickname"
                value={displayName}
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={nameError ? "signupNameError" : undefined}
                disabled={isLoading}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setNameError(null);
                  setServerAlert(null);
                }}
                required
              />
              {nameError && (
                <div id="signupNameError" className="field-error-msg" role="alert">
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
                  <span>{nameError}</span>
                </div>
              )}
              <p className="field-help-text">
                매장 방문 수령 시 상인분께서 확인하실 친근한 호칭입니다.
              </p>
            </div>

            {/* 4. 비밀번호 */}
            <div className="field-group">
              <label htmlFor="signupPassword" className="field-label">
                비밀번호{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  id="signupPassword"
                  className="input-box"
                  placeholder="영문·숫자·특수문자를 포함한 8~32자"
                  autoComplete="new-password"
                  value={password}
                  aria-invalid={passwordError ? "true" : "false"}
                  aria-describedby={passwordError ? "signupPasswordError" : undefined}
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
                <div id="signupPasswordError" className="field-error-msg" role="alert">
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
              id="btnSignupSubmit"
              className={`btn-submit-primary ${isLoading ? "is-loading" : ""}`}
              disabled={isLoading}
            >
              {isLoading && <span className="spinner-icon" aria-hidden="true" />}
              <span className="btn-text">
                {isLoading ? "등록 처리 중..." : "동네 단골손님 등록하기"}
              </span>
            </button>
          </form>

          <div className="form-footer-navigation">
            <span>이미 계정이 있으신가요?</span>
            <button type="button" className="text-action-link" onClick={onNavigateLogin}>
              로그인 화면으로 이동
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
