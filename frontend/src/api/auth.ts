import { apiGet, apiPostEmpty, apiPostForm, refreshCsrfSilently } from "./client";
import type { LoginResponse, UserMe } from "./types";

/**
 * 로그인 요청 (x-www-form-urlencoded)
 * 로그인 성공 후 새 CSRF 토큰을 안전하게 갱신합니다.
 */
export async function login(loginId: string, password: string): Promise<LoginResponse> {
  const result = await apiPostForm<LoginResponse>("/api/auth/login", {
    loginId,
    password,
  });
  await refreshCsrfSilently();
  return result;
}

/**
 * 로그아웃 요청 (POST 204)
 * 로그아웃 성공 후 새 CSRF 토큰을 안전하게 갱신합니다.
 */
export async function logout(): Promise<void> {
  await apiPostEmpty("/api/auth/logout");
  await refreshCsrfSilently();
}

/**
 * 현재 로그인 사용자 정보 조회
 * 미인증/세션 만료 시 401 ApiError를 던집니다.
 */
export async function getMe(): Promise<UserMe> {
  return apiGet<UserMe>("/api/auth/me");
}
