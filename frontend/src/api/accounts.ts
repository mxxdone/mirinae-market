import { apiPostJson } from "./client";
import type { AccountView, SignupRequest } from "./types";

/**
 * 구매자 계정 생성 (회원가입)
 */
export async function signup(request: SignupRequest): Promise<AccountView> {
  return apiPostJson<AccountView>("/api/accounts", request);
}
