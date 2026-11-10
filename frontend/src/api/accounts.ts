import { apiGet, apiPostJson, refreshCsrfSilently } from "./client";
import type { AccountView, SignupRequest } from "./types";

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

export async function withdrawBuyer(password: string): Promise<void> {
  const result = await apiPostJson<unknown>("/api/buyer/withdrawal", { password });
  if (result !== undefined)
    throw new Error("탈퇴 처리 결과를 확인하지 못했습니다. 다시 로그인해 확인해 주세요.");
  await refreshCsrfSilently();
}
