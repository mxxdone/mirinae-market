import { ApiError, type ApiErrorPayload, type CsrfToken, type LoginResponse } from "./types";

/**
 * 인메모리 CSRF 토큰 상태
 * 보안 규칙: localStorage/sessionStorage 등 브라우저 스토리지에 저장하지 않습니다.
 */
let currentCsrf: CsrfToken | null = null;

/**
 * 인메모리 Access JWT 토큰 상태
 * 보안 규칙: 메모리에만 보관하며 localStorage, sessionStorage, BroadcastChannel, URL 등에 전달하지 않습니다.
 */
let currentAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;

/**
 * 인증 흐름 세대 번호 (authGeneration)
 * 로그아웃 뒤 늦게 도착한 비동기 응답(refresh 등)이 메모리 인증을 되살리는 것을 원천 차단합니다.
 */
let authGeneration = 0;

/**
 * 단일 탭 내 동시 갱신 단일 요청 합치기 (Promise singleflight)
 */
let inFlightRefreshPromise: Promise<string | null> | null = null;

/**
 * 다중 탭 로그아웃 알림용 토큰 없는 BroadcastChannel
 * 보안 규칙: 채널 메시지에 토큰을 절대 포함하지 않으며 이벤트 타입만 전송합니다.
 */
let authChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  try {
    authChannel = new BroadcastChannel("mirinae_auth_channel");
    authChannel.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "LOGOUT") {
        invalidateAuthGeneration();
        currentCsrf = null;
        for (const listener of onLogoutListeners) {
          try {
            listener();
          } catch {
            // 리스너 오류 무시
          }
        }
      }
    });
  } catch {
    authChannel = null;
  }
}

const onLogoutListeners = new Set<() => void>();

export function registerLogoutListener(listener: () => void): () => void {
  onLogoutListeners.add(listener);
  return () => {
    onLogoutListeners.delete(listener);
  };
}

export function broadcastLogoutEvent(): void {
  try {
    authChannel?.postMessage({ type: "LOGOUT" });
  } catch {
    // 채널 전송 실패 무시
  }
}

/**
 * JWT 파싱 헬퍼: 신뢰 목적이 아닌 만료 스케줄 참고용으로만 사용합니다.
 * 실제 인증 및 검증은 서버가 authoritative합니다.
 */
function parseJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    const encoded = parts[1];
    if (parts.length < 2 || !encoded) return null;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp === "number") {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null, expiresInSeconds?: number): void {
  currentAccessToken = token;
  if (!token) {
    tokenExpiresAt = null;
    return;
  }
  if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
    tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
  } else {
    tokenExpiresAt = parseJwtExpMs(token) ?? Date.now() + 600 * 1000;
  }
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

export function clearAuthTokens(): void {
  currentAccessToken = null;
  tokenExpiresAt = null;
}

export function getAuthGeneration(): number {
  return authGeneration;
}

export function invalidateAuthGeneration(): number {
  authGeneration += 1;
  clearAuthTokens();
  return authGeneration;
}

/**
 * 기본 네트워크 타임아웃 (10초)
 */
const DEFAULT_TIMEOUT_MS = 10000;

interface RequestOptions {
  timeoutMs?: number;
}

/**
 * 타임아웃 및 네트워크 오류 래퍼
 * 모든 fetch 요청이 무한 대기하지 않도록 제한하고 시간 초과 시 친절한 한국어 오류를 던집니다.
 * Authorization: Bearer 헤더를 메모리 토큰이 존재할 때 자동 첨부합니다.
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & RequestOptions,
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();

  let combinedSignal: AbortSignal = controller.signal;
  if (init?.signal) {
    const externalSignal = init.signal;
    if ("any" in AbortSignal && typeof AbortSignal.any === "function") {
      combinedSignal = AbortSignal.any([externalSignal, controller.signal]);
    } else {
      combinedSignal = externalSignal;
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new Error("REQUEST_TIMEOUT"));
  }, timeoutMs);

  const headers = new Headers(init?.headers);
  if (currentAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${currentAccessToken}`);
  }

  try {
    const response = await fetch(input, {
      ...init,
      headers,
      signal: combinedSignal,
    });
    return response;
  } catch (err: unknown) {
    if (
      (err instanceof Error && (err.name === "AbortError" || err.message === "REQUEST_TIMEOUT")) ||
      controller.signal.aborted
    ) {
      throw new ApiError(
        408,
        "TIMEOUT",
        "서버 응답 시간이 초과되었습니다. 네트워크 연결 상태를 확인하고 다시 시도해 주세요.",
      );
    }
    if (err instanceof TypeError) {
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "서버와 통신할 수 없습니다. 네트워크 연결 상태를 확인해 주세요.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * CSRF 토큰 조회 및 캐시 갱신
 */
export async function fetchCsrfToken(): Promise<CsrfToken> {
  const response = await fetchWithTimeout("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw await parseApiError(
      response,
      "CSRF 토큰 발급에 실패했습니다.",
      getAuthGeneration(),
      currentAccessToken,
    );
  }

  const data = (await response.json()) as CsrfToken;
  currentCsrf = data;
  return data;
}

/**
 * 캐시된 CSRF 토큰 반환 (없으면 새로 조회)
 */
export async function getCsrfToken(): Promise<CsrfToken> {
  if (currentCsrf) {
    return currentCsrf;
  }
  return fetchCsrfToken();
}

/**
 * 로그인/로그아웃 성공 후 후속 CSRF 갱신 (변경 요청 자체의 성공과 분리하여 실패 시 무시)
 */
export async function refreshCsrfSilently(): Promise<void> {
  try {
    await fetchCsrfToken();
  } catch {
    // 후속 CSRF 실패를 이미 성공한 이전 변경 요청 실패로 전파하지 않습니다.
    currentCsrf = null;
  }
}

/**
 * 요청 전 토큰 만료 임박(30초 미만 남음) 시 access 토큰 갱신
 * 주기적 타이머 갱신 금지; 실제 API 요청 직전에만 필요 시 갱신합니다.
 * 갱신 실패(401/503 등) 시 오류를 숨기지 않고 전파하여, 미인증 상태로 업무 변경 요청이 발송되는 것을 차단합니다.
 */
async function ensureValidAccessToken(): Promise<void> {
  if (currentAccessToken && tokenExpiresAt && tokenExpiresAt - Date.now() < 30000) {
    await refreshAccessToken();
  }
}

/**
 * Access Token 갱신 (RTR)
 * 단일 탭: Promise singleflight로 동시 갱신 요청을 하나로 합침
 * 다중 탭: Web Locks API로 쿠키 변경 직렬화
 * Web Locks 미지원 시 무리한 자동 복원 대신 명시 재로그인 유도 (예외 발생)
 * 회전 요청 timeout/응답 유실 시 자동 재시도 금지
 * 흐름 세대 검사로 로그아웃 후 늦은 응답의 인증 복원 방지 (response.json 파싱 이후 검사 필수)
 */
export async function refreshAccessToken(): Promise<string | null> {
  // Web Locks 미지원 환경에서는 무리한 자동 복원을 시도하지 않고 명시적 재로그인을 유도합니다.
  if (typeof navigator !== "undefined" && !navigator.locks?.request) {
    clearAuthTokens();
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "브라우저에서 Web Locks를 지원하지 않아 세션 자동 갱신이 제한됩니다. 다시 로그인해 주세요.",
    );
  }

  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const currentGen = authGeneration;
  // 요청 시점 토큰을 함께 스냅샷한다. refresh는 세대를 바꾸지 않고 토큰만 교체하므로 토큰 비교가 필요하다.
  const tokenSnapshot = currentAccessToken;

  const executeRefresh = async (): Promise<string | null> => {
    try {
      const csrf = await getCsrfToken();
      const response = await fetchWithTimeout("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          [csrf.headerName]: csrf.token,
        },
      });

      if (!response.ok) {
        // 토큰 정리는 parseApiError가 요청 시점 스냅샷과 비교한 뒤 결정한다.
        // 여기서 먼저 지우면 스냅샷이 null로 바뀌어 실제 만료 401이 409 AUTH_REQUEST_SUPERSEDED로 오판된다.
        throw await parseApiError(
          response,
          "인증 세션 갱신에 실패했습니다.",
          currentGen,
          tokenSnapshot,
        );
      }

      const data = (await response.json()) as LoginResponse;

      // 로그아웃·재로그인으로 세대나 토큰이 바뀐 뒤 도착한 응답은 무시한다(response.json() 이후 재검사).
      if (authGeneration !== currentGen || currentAccessToken !== tokenSnapshot) {
        return null;
      }

      if (data.accessToken) {
        setAccessToken(data.accessToken, data.expiresIn);
        return data.accessToken;
      }
      return null;
    } catch (err: unknown) {
      if (authGeneration === currentGen && currentAccessToken === tokenSnapshot) {
        clearAuthTokens();
      }
      throw err;
    } finally {
      inFlightRefreshPromise = null;
    }
  };

  inFlightRefreshPromise = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request("mirinae_auth_lock", executeRefresh);
    }
    return executeRefresh();
  })();

  return inFlightRefreshPromise;
}

/**
 * 공통 API 오류 파싱 헬퍼
 *
 * 요청을 보낸 시점의 인증 세대와 access 토큰을 함께 캡처해 전달한다. refresh는 authGeneration을 바꾸지 않고 토큰만 교체하므로,
 * 세대만 비교하면 갱신 전 토큰의 늦은 401이 새 토큰을 지운다. 두 값이 모두 같을 때만 실제 만료로 보고, 하나라도 달라졌으면 409
 * AUTH_REQUEST_SUPERSEDED로 분리해 새 토큰·CSRF를 보존한다. `response.json()` await 이후에도 같은 판정을 다시 한다.
 */
async function parseApiError(
  response: Response,
  defaultMessage: string,
  requestGen: number,
  requestToken: string | null,
): Promise<ApiError> {
  let payload: Partial<ApiErrorPayload> | null = null;
  try {
    payload = (await response.json()) as Partial<ApiErrorPayload>;
  } catch {
    payload = null;
  }
  const superseded = isSuperseded(requestGen, requestToken);
  if (response.status === 401 && superseded) {
    return new ApiError(
      409,
      "AUTH_REQUEST_SUPERSEDED",
      "인증 상태가 변경되어 이전 요청의 결과를 적용하지 않았습니다.",
      [],
    );
  }
  if (response.status === 401) {
    // 여전히 같은 세대·같은 토큰의 401만 실제 만료로 보고 토큰·CSRF를 정리한다.
    currentCsrf = null;
    clearAuthTokens();
  }
  const code = payload?.code || mapStatusToDefaultCode(response.status);
  const message = payload?.message || defaultMessage;
  return new ApiError(
    response.status,
    code,
    message,
    Array.isArray(payload?.issues) ? payload.issues : [],
  );
}

/** 요청을 보낸 뒤 세대나 access 토큰 중 하나라도 바뀌었는지 판정한다. */
function isSuperseded(requestGen: number, requestToken: string | null): boolean {
  return requestGen !== authGeneration || requestToken !== currentAccessToken;
}

function mapStatusToDefaultCode(status: number): string {
  switch (status) {
    case 400:
      return "INVALID_INPUT";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 409:
      return "DUPLICATE_ACCOUNT";
    case 502:
      return "OAUTH_PROVIDER_ERROR";
    case 503:
      return "AUTH_UNAVAILABLE";
    default:
      return "SERVER_ERROR";
  }
}

/**
 * GET 요청
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }

  const requestGen = authGeneration;
  const requestToken = currentAccessToken;

  const response = await fetchWithTimeout(path, {
    method: "GET",
    signal,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw await parseApiError(
      response,
      "데이터 조회 중 오류가 발생했습니다.",
      requestGen,
      requestToken,
    );
  }

  return (await response.json()) as T;
}

/** 파일 경계 헤더는 브라우저가 생성하며 기존 세션·CSRF 보호를 유지한다. */
export async function apiPostMultipart<T>(path: string, body: FormData): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();
  const requestGen = authGeneration;
  const requestToken = currentAccessToken;
  const response = await fetchWithTimeout(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", [csrf.headerName]: csrf.token },
    body,
    timeoutMs: 30000,
  });
  if (!response.ok) {
    if (response.status === 403) void refreshCsrfSilently();
    // 업무 mutation 401 자동 재전송 금지
    throw await parseApiError(response, "사진을 업로드하지 못했습니다.", requestGen, requestToken);
  }
  return (await response.json()) as T;
}

/**
 * POST 요청 (JSON)
 * 업무 mutation 401 자동 재전송 금지
 */
export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();

  const requestGen = authGeneration;
  const requestToken = currentAccessToken;

  const response = await fetchWithTimeout(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 403) {
      void refreshCsrfSilently();
    }
    // 업무 mutation 401 자동 재전송 금지
    throw await parseApiError(
      response,
      "요청 처리 중 오류가 발생했습니다.",
      requestGen,
      requestToken,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * POST 요청 (x-www-form-urlencoded)
 * 업무 mutation 401 자동 재전송 금지
 */
export async function apiPostForm<T>(path: string, formData: Record<string, string>): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(formData)) {
    searchParams.append(key, value);
  }

  const requestGen = authGeneration;
  const requestToken = currentAccessToken;

  const response = await fetchWithTimeout(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: searchParams.toString(),
  });

  if (!response.ok) {
    if (response.status === 403) {
      void refreshCsrfSilently();
    }
    throw await parseApiError(
      response,
      "요청 처리 중 오류가 발생했습니다.",
      requestGen,
      requestToken,
    );
  }

  return (await response.json()) as T;
}

/**
 * POST 빈 본문 요청 (로그아웃 등 204 기대)
 */
export async function apiPostEmpty(path: string): Promise<void> {
  return apiEmpty(path, "POST");
}

export async function apiDeleteEmpty(path: string): Promise<void> {
  return apiEmpty(path, "DELETE");
}

async function apiEmpty(path: string, method: "POST" | "DELETE"): Promise<void> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();

  const requestGen = authGeneration;
  const requestToken = currentAccessToken;

  const response = await fetchWithTimeout(path, {
    method,
    credentials: "same-origin",
    headers: {
      [csrf.headerName]: csrf.token,
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      void refreshCsrfSilently();
    }
    throw await parseApiError(
      response,
      "요청 처리 중 오류가 발생했습니다.",
      requestGen,
      requestToken,
    );
  }
}

/** PUT 변경 요청은 응답 유실 시 자동 재전송하지 않는다. */
export async function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();
  const requestGen = authGeneration;
  const requestToken = currentAccessToken;
  const response = await fetchWithTimeout(path, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 403) void refreshCsrfSilently();
    // 업무 mutation 401 자동 재전송 금지
    throw await parseApiError(
      response,
      "저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
      requestGen,
      requestToken,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * PATCH 요청 (JSON)
 */
export async function apiPatchJson<T = void>(path: string, body: unknown): Promise<T> {
  if (!path.startsWith("/api/auth/")) {
    await ensureValidAccessToken();
  }
  const csrf = await getCsrfToken();
  const requestGen = authGeneration;
  const requestToken = currentAccessToken;
  const response = await fetchWithTimeout(path, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 403) void refreshCsrfSilently();
    // 업무 mutation 401 자동 재전송 금지
    throw await parseApiError(
      response,
      "변경하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
      requestGen,
      requestToken,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * 로그아웃 요청을 공통 타임아웃 래퍼로 전송한다. Bearer가 있으면 함께 보내고, 없으면 refresh 쿠키로 서버가 폐기한다.
 * 401·403·204는 호출자가 계약대로 처리하고, 그 밖의 상태와 네트워크·시간 초과는 예외로 전달해 로그아웃 실패를 숨기지 않는다.
 */
export async function postLogoutRequest(
  accessToken: string | null,
  csrf: CsrfToken,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [csrf.headerName]: csrf.token,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetchWithTimeout("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers,
  });
}
