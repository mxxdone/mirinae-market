/**
 * 미리내 마켓 Phase 2 API 계약 공용 타입 정의
 */

export interface HealthResponse {
  status: string;
}

export interface CsrfToken {
  token: string;
  headerName: string;
}

export interface SignupRequest {
  loginId: string;
  password: string;
  displayName: string;
  email: string;
}

export interface AccountView {
  id: number;
  loginId: string;
  displayName: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  authenticated: boolean;
}

export type UserRole = "BUYER" | "SELLER";

export interface UserMe {
  id: number;
  loginId: string;
  displayName: string;
  role: UserRole;
}

export interface StoreView {
  id: number;
  marketId: number;
  name: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
