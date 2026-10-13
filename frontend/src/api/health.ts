import { apiGet } from "./client";
import type { HealthResponse } from "./types";

/**
 * 백엔드 상태 검사 (/actuator/health)
 */
export async function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/actuator/health");
}
