import { ApiError, type ApiErrorPayload, type CsrfToken } from "./types";

/**
 * 인메모리 CSRF 토큰 상태
 * 보안 규칙: localStorage/sessionStorage 등 브라우저 스토리지에 저장하지 않습니다.
 */
let currentCsrf: CsrfToken | null = null;

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

  try {
    const response = await fetch(input, {
      ...init,
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
    throw await parseApiError(response, "CSRF 토큰 발급에 실패했습니다.");
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
 * 공통 API 오류 파싱 헬퍼
 */
async function parseApiError(response: Response, defaultMessage: string): Promise<ApiError> {
  // 401 이후에는 이전 세션의 CSRF를 재사용하지 않아 재로그인도 첫 요청부터 가능해야 한다.
  if (response.status === 401) currentCsrf = null;
  try {
    const payload = (await response.json()) as Partial<ApiErrorPayload>;
    const code = payload.code || mapStatusToDefaultCode(response.status);
    const message = payload.message || defaultMessage;
    return new ApiError(
      response.status,
      code,
      message,
      Array.isArray(payload.issues) ? payload.issues : [],
    );
  } catch {
    const code = mapStatusToDefaultCode(response.status);
    return new ApiError(response.status, code, defaultMessage);
  }
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
    default:
      return "SERVER_ERROR";
  }
}

/**
 * GET 요청
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithTimeout(path, {
    method: "GET",
    signal,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw await parseApiError(response, "데이터 조회 중 오류가 발생했습니다.");
  }

  return (await response.json()) as T;
}

/**
 * POST 요청 (JSON)
 */
export async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  const csrf = await getCsrfToken();

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
    // POST 403 자동 재시도 금지: 새 CSRF를 배경에서 얻고 사용자에게 재시도를 유도
    if (response.status === 403) {
      void refreshCsrfSilently();
    }
    throw await parseApiError(response, "요청 처리 중 오류가 발생했습니다.");
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * POST 요청 (x-www-form-urlencoded)
 */
export async function apiPostForm<T>(path: string, formData: Record<string, string>): Promise<T> {
  const csrf = await getCsrfToken();
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(formData)) {
    searchParams.append(key, value);
  }

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
    throw await parseApiError(response, "요청 처리 중 오류가 발생했습니다.");
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
  const csrf = await getCsrfToken();

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
    throw await parseApiError(response, "요청 처리 중 오류가 발생했습니다.");
  }
}

/** PUT 변경 요청은 응답 유실 시 자동 재전송하지 않는다. */
export async function apiPutJson<T>(path: string, body: unknown): Promise<T> {
  const csrf = await getCsrfToken();
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
    throw await parseApiError(
      response,
      "저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * PATCH 요청 (JSON)
 */
export async function apiPatchJson<T = void>(path: string, body: unknown): Promise<T> {
  const csrf = await getCsrfToken();
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
    throw await parseApiError(
      response,
      "변경하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
