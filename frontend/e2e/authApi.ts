import type { Page } from "@playwright/test";

/**
 * 테스트 전용 인증 API 헤더 준비 helper.
 *
 * page.request/context.request는 브라우저 탭의 메모리 access JWT를 공유하지 않는다. 그래서 이미 로그인된 브라우저에서
 * 보호 API를 직접 호출하려면 실제 브라우저 세션으로 Bearer를 준비해야 한다. 이 helper는 page.evaluate 안에서 앱과 동일한
 * Web Lock 직렬화 아래 실제 GET /api/auth/csrf → POST /api/auth/refresh(쿠키+CSRF)를 수행하고, 서버가 돌려준 access
 * JWT와 CSRF 헤더 이름/값만 테스트 Node로 반환한다. 토큰을 window/스토리지/global/로그에 남기지 않으며, 실패하면
 * 명시적으로 throw한다.
 *
 * 사용 범위: 테스트 setup과 기대값 조회 전용. 401/403을 검증하는 명시적 unauth/타역할 조건에는 쓰지 않는다.
 */
export interface AuthenticatedApiHeaders {
  Authorization: string;
  [headerName: string]: string;
}

export async function authenticatedApiHeaders(page: Page): Promise<AuthenticatedApiHeaders> {
  const prepared = await page.evaluate(async () => {
    const run = async (): Promise<{ accessToken: string; headerName: string; csrf: string }> => {
      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!csrfResponse.ok) {
        throw new Error(`CSRF 조회 실패: ${csrfResponse.status}`);
      }
      const csrf = (await csrfResponse.json()) as { token: string; headerName: string };
      // 앱의 refresh와 같은 락으로 직렬화해 RTR 회전 경합을 피한다.
      if (!navigator.locks?.request) {
        throw new Error("Web Locks를 사용할 수 없어 인증 헤더를 준비하지 못했습니다.");
      }
      const token = await navigator.locks.request("mirinae_auth_lock", async () => {
        const refreshResponse = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json", [csrf.headerName]: csrf.token },
        });
        if (!refreshResponse.ok) {
          throw new Error(`인증 갱신 실패: ${refreshResponse.status}`);
        }
        const refreshed = (await refreshResponse.json()) as {
          accessToken?: string;
          authenticated?: boolean;
        };
        if (!refreshed.accessToken) {
          throw new Error("인증 갱신 응답에 accessToken이 없습니다.");
        }
        return refreshed.accessToken;
      });
      return { accessToken: token, headerName: csrf.headerName, csrf: csrf.token };
    };
    return run();
  });

  return {
    Authorization: `Bearer ${prepared.accessToken}`,
    [prepared.headerName]: prepared.csrf,
  };
}
