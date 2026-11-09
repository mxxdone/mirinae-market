import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import { isLoginIdAvailable, signup } from "../../api/accounts";
import { ApiError } from "../../api/types";
import {
  validateDisplayName,
  validateEmail,
  validateLoginId,
  validatePassword,
  validatePasswordConfirmation,
} from "../../validation/signupValidation";
import { BrandIntroPanel } from "../components/BrandIntroPanel";
import { StatusAlert } from "../components/StatusAlert";

interface SignupScreenProps {
  onSignupSuccess: (loginId: string) => void;
  onNavigateLogin: () => void;
}

interface LoginIdCheck {
  value: string;
  status: "checking" | "available" | "taken" | "failed";
}

/**
 * 구매자 회원가입 화면. 비밀번호 확인은 서버로 전송하지 않는다.
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
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [idError, setIdError] = useState<string | null>(null);
  const [idCheck, setIdCheck] = useState<LoginIdCheck | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [serverAlert, setServerAlert] = useState<string | null>(null);
  const idCheckRequest = useRef<AbortController | null>(null);

  useEffect(() => () => idCheckRequest.current?.abort(), []);

  async function checkLoginId(): Promise<void> {
    const formatError = validateLoginId(loginId);
    setIdError(formatError);
    if (formatError || isLoading) return;
    idCheckRequest.current?.abort();
    const controller = new AbortController();
    idCheckRequest.current = controller;
    setIdCheck({ value: loginId, status: "checking" });
    try {
      const available = await isLoginIdAvailable(loginId, controller.signal);
      if (!controller.signal.aborted && idCheckRequest.current === controller) {
        setIdError(null);
        setIdCheck({ value: loginId, status: available ? "available" : "taken" });
      }
    } catch {
      if (!controller.signal.aborted && idCheckRequest.current === controller) {
        setIdCheck({ value: loginId, status: "failed" });
      }
    } finally {
      if (idCheckRequest.current === controller) idCheckRequest.current = null;
    }
  }

  const currentIdCheck = idCheck?.value === loginId ? idCheck : null;
  const idUnavailable = currentIdCheck?.status === "taken";
  const idCheckFailed = currentIdCheck?.status === "failed";
  const idHint =
    idError ??
    (idUnavailable
      ? "이미 사용 중인 아이디입니다."
      : idCheckFailed
        ? "아이디 중복 확인에 실패했습니다. 다시 시도해 주세요."
        : currentIdCheck?.status === "checking"
          ? "아이디 중복을 확인하고 있습니다."
          : currentIdCheck?.status === "available"
            ? "사용 가능한 아이디입니다."
            : !loginId
              ? "영문 소문자와 숫자 5~20자"
              : null);
  const idHintId = idError || idUnavailable ? "signupUserIdError" : "signupUserIdHelp";

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setServerAlert(null);

    // 클라이언트 정밀 검증
    const errId = validateLoginId(loginId);
    const errEmail = validateEmail(email);
    const errName = validateDisplayName(displayName);
    const errPw = validatePassword(password);
    const errConfirmation = validatePasswordConfirmation(password, passwordConfirmation);

    setIdError(errId);
    setEmailError(errEmail);
    setNameError(errName);
    setPasswordError(errPw);
    setConfirmationError(errConfirmation);

    if (errId || idUnavailable || errEmail || errName || errPw || errConfirmation) {
      return;
    }
    if (currentIdCheck?.status !== "available") {
      setIdError("아이디 중복 확인을 해 주세요.");
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
      setPasswordConfirmation("");
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
          servicePill="회원가입"
          sealText="미리내"
          headline="동네 시장 장보기, 미리내에서 시작하세요"
          subtext="장보기에 사용할 계정을 만들어 주세요."
          steps={[
            {
              number: "✓",
              title: "시장 상품 둘러보기",
              desc: "가까운 시장과 매장의 오늘 판매 상품을 확인하세요.",
            },
            {
              number: "✓",
              title: "주문하고 매장에서 수령하기",
              desc: "상품을 주문하고 안내된 시간에 매장에서 받아 가세요.",
            },
          ]}
          footerNote="동네 이웃과 시장 상인의 신뢰를 잇는 장보기"
          variant="basket"
        />

        <div className="form-card-panel">
          <div className="form-header-area">
            <h2 id="heading-signup" className="form-title-heading">
              회원가입
            </h2>
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
              <div className="signup-id-input-wrap">
                <input
                  type="text"
                  id="signupUserId"
                  className="input-box"
                  placeholder="아이디 입력"
                  autoComplete="username"
                  value={loginId}
                  aria-invalid={idError || idUnavailable ? "true" : "false"}
                  aria-describedby={idHint ? idHintId : undefined}
                  disabled={isLoading}
                  onChange={(e) => {
                    idCheckRequest.current?.abort();
                    idCheckRequest.current = null;
                    setLoginId(e.target.value);
                    setIdError(validateLoginId(e.target.value));
                    setIdCheck(null);
                    setServerAlert(null);
                  }}
                  required
                />
                <button
                  type="button"
                  className="signup-id-check-button"
                  disabled={
                    isLoading ||
                    currentIdCheck?.status === "checking" ||
                    currentIdCheck?.status === "available"
                  }
                  aria-busy={currentIdCheck?.status === "checking"}
                  onClick={() => void checkLoginId()}
                >
                  {currentIdCheck?.status === "checking" ? "확인 중…" : "중복 확인"}
                </button>
              </div>
              {idHint && (
                <p
                  id={idHintId}
                  className={
                    idError || idUnavailable || idCheckFailed
                      ? "field-error-msg"
                      : currentIdCheck?.status === "available"
                        ? "field-help-text signup-id-available"
                        : "field-help-text"
                  }
                  aria-live="polite"
                >
                  {idHint}
                </p>
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
                placeholder="예: user@example.com"
                autoComplete="email"
                value={email}
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={
                  emailError ? "signupEmailError" : !email ? "signupEmailHelp" : undefined
                }
                disabled={isLoading}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(validateEmail(e.target.value));
                  setServerAlert(null);
                }}
                required
              />
              {emailError ? (
                <p id="signupEmailError" className="field-error-msg" role="alert">
                  {emailError}
                </p>
              ) : !email ? (
                <p id="signupEmailHelp" className="field-help-text">
                  계정에 연결할 이메일 주소를 입력해 주세요.
                </p>
              ) : null}
            </div>

            {/* 3. 표시 이름 */}
            <div className="field-group">
              <label htmlFor="signupName" className="field-label">
                이름 또는 닉네임{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type="text"
                id="signupName"
                className="input-box"
                placeholder="이름 또는 닉네임 입력"
                autoComplete="nickname"
                value={displayName}
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={
                  nameError ? "signupNameError" : !displayName ? "signupNameHelp" : undefined
                }
                disabled={isLoading}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setNameError(validateDisplayName(e.target.value));
                  setServerAlert(null);
                }}
                required
              />
              {nameError ? (
                <p id="signupNameError" className="field-error-msg" role="alert">
                  {nameError}
                </p>
              ) : !displayName ? (
                <p id="signupNameHelp" className="field-help-text">
                  수령할 때 사용할 이름 또는 닉네임입니다.
                </p>
              ) : null}
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
                  placeholder="비밀번호 입력"
                  autoComplete="new-password"
                  value={password}
                  aria-invalid={passwordError ? "true" : "false"}
                  aria-describedby={
                    passwordError
                      ? "signupPasswordError"
                      : !password
                        ? "signupPasswordHelp"
                        : undefined
                  }
                  disabled={isLoading}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(validatePassword(e.target.value));
                    setConfirmationError(null);
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
              {passwordError ? (
                <p id="signupPasswordError" className="field-error-msg" role="alert">
                  {passwordError}
                </p>
              ) : !password ? (
                <p id="signupPasswordHelp" className="field-help-text">
                  영문·숫자·특수문자를 포함한 8~32자
                </p>
              ) : null}
            </div>

            <div className="field-group">
              <label htmlFor="signupPasswordConfirmation" className="field-label">
                비밀번호 확인{" "}
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                type={showPassword ? "text" : "password"}
                id="signupPasswordConfirmation"
                className="input-box"
                placeholder="비밀번호를 한 번 더 입력"
                autoComplete="new-password"
                value={passwordConfirmation}
                aria-invalid={confirmationError ? "true" : "false"}
                aria-describedby={confirmationError ? "signupPasswordConfirmationError" : undefined}
                disabled={isLoading}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  setConfirmationError(null);
                  setServerAlert(null);
                }}
                required
              />
              {confirmationError && (
                <div id="signupPasswordConfirmationError" className="field-error-msg" role="alert">
                  {confirmationError}
                </div>
              )}
            </div>

            <button
              type="submit"
              id="btnSignupSubmit"
              className={`btn-submit-primary ${isLoading ? "is-loading" : ""}`}
              disabled={isLoading || currentIdCheck?.status === "checking"}
            >
              {isLoading && <span className="spinner-icon" aria-hidden="true" />}
              <span className="btn-text">{isLoading ? "가입 처리 중..." : "회원가입"}</span>
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
