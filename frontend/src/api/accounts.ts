import {
  apiGet,
  apiPatchJson,
  apiPostJson,
  broadcastLogoutEvent,
  clearAuthTokens,
  invalidateAuthGeneration,
  refreshCsrfSilently,
} from "./client";
import type { AccountView, BuyerProfileResponse, SignupRequest } from "./types";

/**
 * 구매자 계정 생성 (회원가입)
 */
export async function signup(request: SignupRequest): Promise<AccountView> {
  return apiPostJson<AccountView>("/api/accounts", request);
}

export async function isLoginIdAvailable(loginId: string, signal?: AbortSignal): Promise<boolean> {
  const result = await apiGet<{ available: boolean }>(
    `/api/accounts/login-id-availability?loginId=${encodeURIComponent(loginId)}`,
    signal,
  );
  if (typeof result?.available !== "boolean") {
    throw new Error("아이디 중복 확인 응답이 올바르지 않습니다.");
  }
  return result.available;
}

/**
 * 구매자 탈퇴 (POST /api/buyer/withdrawal)
 * 로컬 계정: password 필수
 * 소셜 전용 계정: password 생략 가능 (5분 내 소셜 재인증 쿠키 필요)
 * 탈퇴 완료 시 모든 기기/메모리 인증 토큰을 폐기합니다.
 */
export async function withdrawBuyer(password?: string): Promise<void> {
  const body = password !== undefined ? { password } : {};
  const result = await apiPostJson<unknown>("/api/buyer/withdrawal", body);
  if (result !== undefined) {
    throw new Error("탈퇴 처리 결과를 확인하지 못했습니다. 다시 로그인해 확인해 주세요.");
  }
  invalidateAuthGeneration();
  clearAuthTokens();
  broadcastLogoutEvent();
  await refreshCsrfSilently();
}

/**
 * 구매자 표시 이름 변경 (PATCH /api/buyer/profile)
 * 활성 구매자 본인의 표시 이름만 변경하며, 응답으로 서버가 저장한 { displayName }을 반환합니다.
 * 편집값을 임의로 자르거나 trim하지 않습니다.
 */
export async function changeBuyerDisplayName(displayName: string): Promise<BuyerProfileResponse> {
  const result = await apiPatchJson<BuyerProfileResponse>("/api/buyer/profile", { displayName });
  if (!result || typeof result.displayName !== "string") {
    throw new Error("표시 이름 변경 응답이 올바르지 않습니다.");
  }
  return result;
}
