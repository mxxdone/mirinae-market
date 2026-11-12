import {
  apiGet,
  apiPostForm,
  apiPostJson,
  broadcastLogoutEvent,
  clearAuthTokens,
  getAccessToken,
  getAuthGeneration,
  getCsrfToken,
  invalidateAuthGeneration,
  postLogoutRequest,
  refreshAccessToken,
  refreshCsrfSilently,
  setAccessToken,
} from "./client";
import {
  ApiError,
  type LoginResponse,
  type OAuthFlowResponse,
  type OAuthLinkRequest,
  type OAuthProvidersResponse,
  type OAuthPurpose,
  type OAuthStartResponse,
  type UserMe,
} from "./types";

// Client의 refreshAccessToken을 auth 공개 진입점으로 재수출
export { refreshAccessToken } from "./client";

/**
 * 로그인 요청 (x-www-form-urlencoded)
 * 로그인 성공 후 access token을 메모리에 설정하고 새 CSRF 토큰을 갱신합니다.
 */
export async function login(loginId: string, password: string): Promise<LoginResponse> {
  invalidateAuthGeneration();
  const currentGen = getAuthGeneration();

  const result = await apiPostForm<LoginResponse>("/api/auth/login", {
    loginId,
    password,
  });

  if (getAuthGeneration() === currentGen && result.accessToken) {
    setAccessToken(result.accessToken, result.expiresIn);
  }
  await refreshCsrfSilently();
  return result;
}

/**
 * 로그아웃 요청 (POST 204)
 * 공유 락(Web Locks) 하에서 인증 토큰(Bearer)을 유지한 상태로 로그아웃을 요청합니다.
 * - 성공(204) 시에만 세대를 무효화하고 메모리 토큰을 비우며 타 탭에 LOGOUT 이벤트를 전파합니다.
 * - 401(이미 만료됨) 시에도 안전하게 토큰을 비우고 상태를 정리합니다.
 * - 타임아웃, 503, 네트워크 오류 등 전송 실패 시에는 토큰과 사용자 상태를 보존하여 재시도를 제공합니다.
 * - 락을 쥔 상태에서 재귀적으로 refresh를 호출하지 않습니다.
 */
export async function logout(): Promise<void> {
  const capturedToken = getAccessToken();
  const capturedGen = getAuthGeneration();

  const executeLogout = async (): Promise<void> => {
    // CSRF는 auth 공개 진입점의 live binding을 사용한다. 요청은 공통 타임아웃 래퍼로 보내 무한 대기를 막는다.
    const csrf = await getCsrfToken();
    const response = await postLogoutRequest(capturedToken, csrf);

    if (response.status === 204) {
      // 서버에서 정상 폐기 확인됨 -> 세대 무효화 및 토큰 정리, 타 탭 알림 전송
      if (getAuthGeneration() === capturedGen) {
        invalidateAuthGeneration();
      }
      broadcastLogoutEvent();
      await refreshCsrfSilently();
      return;
    }

    if (response.status === 401) {
      // 서버에서 이미 세션이 만료/폐기됨 -> 정상 정리
      if (getAuthGeneration() === capturedGen) {
        invalidateAuthGeneration();
      }
      broadcastLogoutEvent();
      await refreshCsrfSilently();
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "로그인 세션이 이미 만료되어 로그아웃 처리되었습니다.",
      );
    }

    // 503, 403, 500 등 서버 장애 시: 토큰과 사용자 상태를 보존하고 오류를 던져 재시도를 허용합니다.
    if (response.status === 403) {
      void refreshCsrfSilently();
    }
    let message = "로그아웃 요청을 처리하지 못했습니다. 다시 시도해 주세요.";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      response.status === 503 ? "AUTH_UNAVAILABLE" : "SERVER_ERROR",
      message,
    );
  };

  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    await navigator.locks.request("mirinae_auth_lock", executeLogout);
  } else {
    await executeLogout();
  }
}

/**
 * 중앙 집중식 로컬 세션 종료 처리 (비밀번호 변경 등 전 기기 세션 종료 시 호출)
 */
export function handleAuthTerminated(): void {
  invalidateAuthGeneration();
  broadcastLogoutEvent();
  clearAuthTokens();
}

/**
 * 현재 로그인 사용자 정보 조회
 * 미인증/세션 만료 시 401 ApiError를 던집니다. hasLocalPassword, linkedProviders를 포함합니다.
 */
export async function getMe(signal?: AbortSignal): Promise<UserMe> {
  return apiGet<UserMe>("/api/auth/me", signal);
}

/**
 * 새로고침 시 인증 복원 bootstrap
 * 규칙: refresh 후 me 조회
 * Web Locks 미지원 시 무리한 자동 복원 대신 명시 재로그인 유도 (null 반환)
 * 401은 미인증 상태로 null 반환하되, 503 AUTH_UNAVAILABLE이나 네트워크 오류는 숨기지 않고 예외를 보존하여 재시도를 제공합니다.
 */
export async function bootstrapAuth(): Promise<UserMe | null> {
  if (typeof navigator !== "undefined" && !navigator.locks?.request) {
    clearAuthTokens();
    return null;
  }

  const currentGen = getAuthGeneration();
  try {
    const token = await refreshAccessToken();
    if (!token || getAuthGeneration() !== currentGen) {
      if (getAuthGeneration() === currentGen) {
        clearAuthTokens();
      }
      return null;
    }
    const me = await getMe();
    if (getAuthGeneration() !== currentGen) {
      return null;
    }
    return me;
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      if (getAuthGeneration() === currentGen) {
        clearAuthTokens();
      }
      return null;
    }
    // 503 AUTH_UNAVAILABLE, 408 TIMEOUT, 0 NETWORK_ERROR 등은 복원 오류로 보존 및 전파
    throw err;
  }
}

/**
 * 활성화된 OAuth 제공자 목록 조회 (GET /api/auth/oauth/providers)
 * 실제 설정된 제공자만 반환합니다.
 */
export async function getOAuthProviders(signal?: AbortSignal): Promise<string[]> {
  const result = await apiGet<OAuthProvidersResponse>("/api/auth/oauth/providers", signal);
  return result.providers || [];
}

/**
 * OAuth 흐름 시작 (POST /api/auth/oauth/{provider}/start)
 * purpose: 'login' | 'link' | 'withdraw'
 * 반환된 authorizationUrl로 이동합니다.
 */
export async function startOAuth(
  provider: string,
  purpose: OAuthPurpose,
): Promise<OAuthStartResponse> {
  return apiPostJson<OAuthStartResponse>(`/api/auth/oauth/${encodeURIComponent(provider)}/start`, {
    purpose,
  });
}

/**
 * OAuth 콜백 흐름 상태 조회 (GET /api/auth/oauth/flow)
 * status: 'LOGIN' | 'SIGNUP' | 'LINK' | 'REAUTH' | 'ERROR'
 * linkVerified: boolean (소셜 재인증 증명 완료 여부)
 */
export async function getOAuthFlow(signal?: AbortSignal): Promise<OAuthFlowResponse> {
  return apiGet<OAuthFlowResponse>("/api/auth/oauth/flow", signal);
}

/**
 * 소셜 신규 회원가입 (POST /api/auth/oauth/signup)
 * 완료 시 토큰 응답을 반환하며 메모리에 즉시 설정하여 자동 로그인합니다.
 */
export async function signupOAuth(displayName: string, email: string): Promise<LoginResponse> {
  invalidateAuthGeneration();
  const currentGen = getAuthGeneration();

  const result = await apiPostJson<LoginResponse>("/api/auth/oauth/signup", {
    displayName,
    email,
  });

  if (getAuthGeneration() === currentGen && result.accessToken) {
    setAccessToken(result.accessToken, result.expiresIn);
  }
  await refreshCsrfSilently();
  return result;
}

/**
 * 소셜 계정 연결 (POST /api/auth/oauth/link)
 * 로컬 아이디/비밀번호 또는 기존 소셜 재인증 후 명시적 동의로 연결합니다.
 */
export async function linkOAuth(request: OAuthLinkRequest): Promise<LoginResponse> {
  invalidateAuthGeneration();
  const currentGen = getAuthGeneration();

  const result = await apiPostJson<LoginResponse>("/api/auth/oauth/link", request);

  if (getAuthGeneration() === currentGen && result.accessToken) {
    setAccessToken(result.accessToken, result.expiresIn);
  }
  await refreshCsrfSilently();
  return result;
}
