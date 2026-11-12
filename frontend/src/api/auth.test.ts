import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withdrawBuyer } from "./accounts";
import {
  bootstrapAuth,
  getMe,
  getOAuthFlow,
  getOAuthProviders,
  linkOAuth,
  login,
  logout,
  signupOAuth,
  startOAuth,
} from "./auth";
import * as client from "./client";
import {
  ApiError,
  type LoginResponse,
  type OAuthFlowResponse,
  type OAuthProvidersResponse,
  type OAuthStartResponse,
  type UserMe,
} from "./types";

describe("auth API and in-memory JWT management", () => {
  beforeEach(() => {
    client.clearAuthTokens();
    client.invalidateAuthGeneration();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    client.clearAuthTokens();
    vi.restoreAllMocks();
  });

  describe("in-memory access token lifecycle", () => {
    it("토큰을 메모리에만 보관하고 스토리지에 남기지 않는다", () => {
      expect(client.getAccessToken()).toBeNull();

      client.setAccessToken("test-access-token", 600);
      expect(client.getAccessToken()).toBe("test-access-token");
      client.clearAuthTokens();
      expect(client.getAccessToken()).toBeNull();
    });

    it("세대 번호를 증가시키고 토큰을 무효화한다", () => {
      const initialGen = client.getAuthGeneration();
      client.setAccessToken("token-to-invalidate", 600);
      const nextGen = client.invalidateAuthGeneration();
      expect(nextGen).toBe(initialGen + 1);
      expect(client.getAccessToken()).toBeNull();
    });
  });

  describe("login", () => {
    it("폼 로그인이 성공하면 메모리에 access token을 설정하고 응답을 반환한다", async () => {
      const mockResponse: LoginResponse = {
        authenticated: true,
        accessToken: "access-token-123",
        expiresIn: 600,
      };
      const postFormSpy = vi.spyOn(client, "apiPostForm").mockResolvedValue(mockResponse);
      const refreshCsrfSpy = vi.spyOn(client, "refreshCsrfSilently").mockResolvedValue();

      const result = await login("buyer01", "Password123!");
      expect(postFormSpy).toHaveBeenCalledWith("/api/auth/login", {
        loginId: "buyer01",
        password: "Password123!",
      });
      expect(client.getAccessToken()).toBe("access-token-123");
      expect(refreshCsrfSpy).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });

  describe("logout", () => {
    it("204 성공 시 Bearer 헤더를 포함하여 요청하고 세대를 변경하며 토큰을 정리하고 타 탭에 알린다", async () => {
      client.setAccessToken("active-token", 600);
      const initialGen = client.getAuthGeneration();
      const broadcastSpy = vi.spyOn(client, "broadcastLogoutEvent").mockImplementation(() => {});
      vi.spyOn(client, "getCsrfToken").mockResolvedValue({
        token: "csrf-tok",
        headerName: "X-CSRF-TOKEN",
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 204 }));

      await logout();

      const logoutCall = fetchSpy.mock.calls.find(([input]) => input === "/api/auth/logout");
      expect(logoutCall).toBeDefined();
      const init = logoutCall?.[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(init.method).toBe("POST");
      expect(headers.get("Authorization")).toBe("Bearer active-token");
      expect(headers.get("X-CSRF-TOKEN")).toBe("csrf-tok");
      expect(client.getAccessToken()).toBeNull();
      expect(client.getAuthGeneration()).toBeGreaterThan(initialGen);
      expect(broadcastSpy).toHaveBeenCalled();
    });

    it("401 만료 응답 시에도 토큰을 정리하고 LOGOUT 이벤트를 전파하며 401 ApiError를 던진다", async () => {
      client.setAccessToken("stale-token", 600);
      const broadcastSpy = vi.spyOn(client, "broadcastLogoutEvent").mockImplementation(() => {});
      vi.spyOn(client, "getCsrfToken").mockResolvedValue({
        token: "csrf-tok",
        headerName: "X-CSRF-TOKEN",
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ message: "세션 만료" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(logout()).rejects.toThrow(ApiError);
      expect(client.getAccessToken()).toBeNull();
      expect(broadcastSpy).toHaveBeenCalled();
    });

    it("503 AUTH_UNAVAILABLE 서버 장애 시 토큰과 세대를 보존하고 재시도를 허용한다", async () => {
      client.setAccessToken("keep-this-token", 600);
      const initialGen = client.getAuthGeneration();
      const broadcastSpy = vi.spyOn(client, "broadcastLogoutEvent").mockImplementation(() => {});
      vi.spyOn(client, "getCsrfToken").mockResolvedValue({
        token: "csrf-tok",
        headerName: "X-CSRF-TOKEN",
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ message: "인증 서비스 일시 장애" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(logout()).rejects.toThrow(ApiError);
      expect(client.getAccessToken()).toBe("keep-this-token");
      expect(client.getAuthGeneration()).toBe(initialGen);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("네트워크 오류 발생 시 토큰을 보존하고 NETWORK_ERROR를 던진다", async () => {
      client.setAccessToken("network-retry-token", 600);
      const initialGen = client.getAuthGeneration();
      const broadcastSpy = vi.spyOn(client, "broadcastLogoutEvent").mockImplementation(() => {});
      vi.spyOn(client, "getCsrfToken").mockResolvedValue({
        token: "csrf-tok",
        headerName: "X-CSRF-TOKEN",
      });
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(logout()).rejects.toThrow(ApiError);
      expect(client.getAccessToken()).toBe("network-retry-token");
      expect(client.getAuthGeneration()).toBe(initialGen);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("응답이 없어 시간 초과되면 무한 대기하지 않고 TIMEOUT으로 실패하며 토큰·세대를 보존한다", async () => {
      vi.useFakeTimers();
      try {
        client.setAccessToken("timeout-token", 600);
        const initialGen = client.getAuthGeneration();
        const broadcastSpy = vi.spyOn(client, "broadcastLogoutEvent").mockImplementation(() => {});
        vi.spyOn(client, "getCsrfToken").mockResolvedValue({
          token: "csrf-tok",
          headerName: "X-CSRF-TOKEN",
        });
        // fetch가 abort될 때까지 응답하지 않는다.
        vi.spyOn(globalThis, "fetch").mockImplementation(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new Error("REQUEST_TIMEOUT")));
            }),
        );

        const pending = logout();
        const assertion = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
        await vi.advanceTimersByTimeAsync(10000);
        await assertion;

        expect(client.getAccessToken()).toBe("timeout-token");
        expect(client.getAuthGeneration()).toBe(initialGen);
        expect(broadcastSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getMe", () => {
    it("hasLocalPassword와 linkedProviders를 포함한 계정 정보를 조회한다", async () => {
      const mockUser: UserMe = {
        id: 1,
        loginId: "social_buyer",
        displayName: "소셜구매자",
        role: "BUYER",
        requiresPasswordChange: false,
        hasLocalPassword: false,
        linkedProviders: ["kakao"],
      };
      const apiGetSpy = vi.spyOn(client, "apiGet").mockResolvedValue(mockUser);

      const result = await getMe();
      expect(apiGetSpy).toHaveBeenCalledWith("/api/auth/me", undefined);
      expect(result).toEqual(mockUser);
      expect(result.hasLocalPassword).toBe(false);
      expect(result.linkedProviders).toEqual(["kakao"]);
    });
  });

  describe("bootstrapAuth", () => {
    it("Web Locks 미지원 환경에서는 무리한 자동 복원 대신 null을 반환하고 재로그인을 유도한다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: undefined,
        configurable: true,
      });

      try {
        const result = await bootstrapAuth();
        expect(result).toBeNull();
        expect(client.getAccessToken()).toBeNull();
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("Web Locks 지원 환경에서 refresh 후 me를 순차 조회하여 세션을 복원한다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi
            .fn()
            .mockImplementation((_name: string, callback: () => Promise<unknown>) => callback()),
        },
        configurable: true,
      });

      try {
        vi.spyOn(client, "refreshAccessToken").mockResolvedValue("new-refreshed-token");
        const mockMe: UserMe = {
          id: 42,
          loginId: "buyer_auto",
          displayName: "자동복원구매자",
          role: "BUYER",
          requiresPasswordChange: false,
          hasLocalPassword: true,
          linkedProviders: ["google"],
        };
        vi.spyOn(client, "apiGet").mockResolvedValue(mockMe);

        const result = await bootstrapAuth();
        expect(result).toEqual(mockMe);
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("503 AUTH_UNAVAILABLE 발생 시 null로 덮지 않고 예외를 보존하여 재시도를 제공한다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi
            .fn()
            .mockImplementation((_name: string, callback: () => Promise<unknown>) => callback()),
        },
        configurable: true,
      });

      try {
        vi.spyOn(client, "refreshAccessToken").mockRejectedValue(
          new ApiError(503, "AUTH_UNAVAILABLE", "인증 서비스를 일시적으로 사용할 수 없습니다."),
        );

        await expect(bootstrapAuth()).rejects.toThrow(ApiError);
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("401 미인증 시에는 null을 반환하고 토큰을 정리한다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi
            .fn()
            .mockImplementation((_name: string, callback: () => Promise<unknown>) => callback()),
        },
        configurable: true,
      });

      try {
        vi.spyOn(client, "refreshAccessToken").mockRejectedValue(
          new ApiError(401, "UNAUTHENTICATED", "미인증 세션"),
        );

        const result = await bootstrapAuth();
        expect(result).toBeNull();
        expect(client.getAccessToken()).toBeNull();
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });
  });

  describe("refreshAccessToken and mutation protection", () => {
    it("Web Locks 미지원 환경에서 refreshAccessToken 호출 시 401 UNAUTHENTICATED 예외를 던진다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: undefined,
        configurable: true,
      });

      try {
        await expect(client.refreshAccessToken()).rejects.toThrow(ApiError);
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("응답 파싱(await response.json()) 이후 세대가 변경(로그아웃)되었으면 늦은 응답으로 토큰을 복원하지 않는다", async () => {
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi.fn().mockImplementation((_name: string, cb: () => Promise<unknown>) => cb()),
        },
        configurable: true,
      });

      try {
        vi.spyOn(client, "getCsrfToken").mockResolvedValue({
          token: "csrf",
          headerName: "X-CSRF-TOKEN",
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
          client.invalidateAuthGeneration();
          return new Response(JSON.stringify({ accessToken: "stale-late-token", expiresIn: 600 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        });

        const token = await client.refreshAccessToken();
        expect(token).toBeNull();
        expect(client.getAccessToken()).toBeNull();
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("만료 임박 토큰의 갱신 실패 시 오류를 전파하여 미인증 상태로 업무 mutation 발송을 차단한다", async () => {
      client.setAccessToken("expiring-token", 10);
      vi.spyOn(client, "refreshAccessToken").mockRejectedValue(
        new ApiError(503, "AUTH_UNAVAILABLE", "인증 서비스 장애"),
      );
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const failure = await client
        .apiPostJson("/api/buyer/cart/items", { offerId: 1, quantity: 1 })
        .catch((err: unknown) => err);
      // 갱신이 실패하면 업무 변경 요청을 보내지 않고 예외를 그대로 전달한다.
      expect(failure).toBeInstanceOf(ApiError);
      expect(fetchSpy.mock.calls.some(([input]) => String(input).includes("/api/buyer/cart"))).toBe(
        false,
      );
    });

    it("늦게 도착한 이전 세대의 401은 새 토큰·CSRF를 지우지 않고 409 AUTH_REQUEST_SUPERSEDED로 분리한다", async () => {
      client.setAccessToken("current-token", 600);
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        // 응답 대기 중 다른 탭/사용자 동작으로 로그인 세대가 바뀐 상황을 재현한다.
        client.setAccessToken("newer-token", 600);
        client.invalidateAuthGeneration();
        client.setAccessToken("newer-token", 600);
        return new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "만료" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      });

      const failure = await client.apiGet("/api/buyer/orders").catch((err: unknown) => err);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).status).toBe(409);
      expect((failure as ApiError).code).toBe("AUTH_REQUEST_SUPERSEDED");
      expect(client.getAccessToken()).toBe("newer-token");
    });

    it("같은 세대의 401은 실제 만료로 처리해 토큰을 정리한다", async () => {
      client.setAccessToken("expired-token", 600);
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "만료" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(client.apiGet("/api/buyer/orders")).rejects.toMatchObject({ status: 401 });
      expect(client.getAccessToken()).toBeNull();
    });
    it("토큰 T1을 보유한 상태의 refresh 실제 401은 409로 오판하지 않고 401로 전파하며 인증 상태를 정리한다", async () => {
      // refresh 실패 분기에서 parseApiError보다 먼저 토큰을 지우면 스냅샷이 null로 바뀌어
      // "다른 요청이 먼저 갱신함"으로 오판해 409 AUTH_REQUEST_SUPERSEDED가 된다. 이를 회귀 검증한다.
      const originalLocks = navigator.locks;
      Object.defineProperty(navigator, "locks", {
        value: {
          request: vi.fn().mockImplementation((_name: string, cb: () => Promise<unknown>) => cb()),
        },
        configurable: true,
      });

      try {
        client.setAccessToken("token-T1", 600);
        const genBefore = client.getAuthGeneration();
        vi.spyOn(client, "getCsrfToken").mockResolvedValue({
          token: "csrf",
          headerName: "X-CSRF-TOKEN",
        });
        // CSRF 선조회는 성공하고 refresh만 실제 401을 받는 상황을 재현한다.
        // (모든 fetch를 401로 두면 refresh 분기가 아니라 CSRF 분기에서 실패해 회귀가 무의미해진다.)
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
          if (String(input).includes("/api/auth/csrf")) {
            return new Response(JSON.stringify({ token: "csrf", headerName: "X-CSRF-TOKEN" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "만료" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        });

        const failure = await client.refreshAccessToken().catch((err: unknown) => err);
        expect(failure).toBeInstanceOf(ApiError);
        expect((failure as ApiError).status).toBe(401);
        expect((failure as ApiError).code).toBe("UNAUTHENTICATED");
        // 실제 만료로 판정했으므로 세대는 그대로 두고 토큰만 정리한다.
        expect(client.getAuthGeneration()).toBe(genBefore);
        expect(client.getAccessToken()).toBeNull();
      } finally {
        Object.defineProperty(navigator, "locks", {
          value: originalLocks,
          configurable: true,
        });
      }
    });

    it("같은 authGeneration에서 refresh로 토큰만 바뀐 뒤 도착한 이전 토큰의 401은 새 토큰을 지우지 않는다", async () => {
      // refresh는 세대를 바꾸지 않고 access만 교체한다. 요청 T1의 늦은 401이 T2를 삭제하면 안 된다.
      client.setAccessToken("token-T1", 600);
      const genBefore = client.getAuthGeneration();
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        client.setAccessToken("token-T2", 600);
        expect(client.getAuthGeneration()).toBe(genBefore);
        return new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "stale" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      });

      const failure = await client.apiGet("/api/buyer/orders").catch((err: unknown) => err);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).status).toBe(409);
      expect((failure as ApiError).code).toBe("AUTH_REQUEST_SUPERSEDED");
      expect(client.getAccessToken()).toBe("token-T2");
    });
  });

  describe("OAuth flow helpers", () => {
    it("GET /api/auth/oauth/providers로 실제 설정된 제공자만 반환한다", async () => {
      const mockProviders: OAuthProvidersResponse = { providers: ["kakao", "google"] };
      vi.spyOn(client, "apiGet").mockResolvedValue(mockProviders);

      const list = await getOAuthProviders();
      expect(list).toEqual(["kakao", "google"]);
    });

    it("POST /api/auth/oauth/{provider}/start로 authorizationUrl을 얻는다", async () => {
      const mockStart: OAuthStartResponse = {
        authorizationUrl: "https://kauth.kakao.com/oauth/authorize?state=123",
      };
      const postJsonSpy = vi.spyOn(client, "apiPostJson").mockResolvedValue(mockStart);

      const res = await startOAuth("kakao", "login");
      expect(postJsonSpy).toHaveBeenCalledWith("/api/auth/oauth/kakao/start", { purpose: "login" });
      expect(res.authorizationUrl).toBe(mockStart.authorizationUrl);
    });

    it("GET /api/auth/oauth/flow 상태를 조회한다", async () => {
      const mockFlow: OAuthFlowResponse = {
        status: "SIGNUP",
        provider: "google",
        displayName: "구글사용자",
        email: "google@market.local",
      };
      vi.spyOn(client, "apiGet").mockResolvedValue(mockFlow);

      const res = await getOAuthFlow();
      expect(res.status).toBe("SIGNUP");
      expect(res.displayName).toBe("구글사용자");
    });

    it("signupOAuth 성공 시 즉시 메모리에 토큰을 설정하고 자동 로그인한다", async () => {
      const mockToken: LoginResponse = {
        authenticated: true,
        accessToken: "oauth-access-token",
        expiresIn: 600,
      };
      vi.spyOn(client, "apiPostJson").mockResolvedValue(mockToken);
      vi.spyOn(client, "refreshCsrfSilently").mockResolvedValue();

      const res = await signupOAuth("신규소셜", "new_social@market.local");
      expect(res.authenticated).toBe(true);
      expect(client.getAccessToken()).toBe("oauth-access-token");
    });

    it("linkOAuth 성공 시 access token을 설정하고 계정을 연결한다", async () => {
      const mockToken: LoginResponse = {
        authenticated: true,
        accessToken: "linked-access-token",
        expiresIn: 600,
      };
      vi.spyOn(client, "apiPostJson").mockResolvedValue(mockToken);
      vi.spyOn(client, "refreshCsrfSilently").mockResolvedValue();

      const res = await linkOAuth({
        confirm: true,
        loginId: "existing_user",
        password: "Password123!",
      });
      expect(res.authenticated).toBe(true);
      expect(client.getAccessToken()).toBe("linked-access-token");
    });

    it("같은 이메일의 기존 회원이면 409 LINK_REQUIRED로 실패하고 자동 연결하지 않는다", async () => {
      const postJsonSpy = vi
        .spyOn(client, "apiPostJson")
        .mockRejectedValue(
          new ApiError(
            409,
            "LINK_REQUIRED",
            "같은 이메일의 기존 계정이 있습니다. 계정 연결을 확인해 주세요.",
          ),
        );

      const failure = await signupOAuth("중복손님", "taken@market.local").catch(
        (err: unknown) => err,
      );
      expect(postJsonSpy).toHaveBeenCalledWith("/api/auth/oauth/signup", {
        displayName: "중복손님",
        email: "taken@market.local",
      });
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).status).toBe(409);
      expect((failure as ApiError).code).toBe("LINK_REQUIRED");
      // 409에서는 회원이 만들어지지 않았으므로 메모리 토큰도 설정하지 않는다.
      expect(client.getAccessToken()).toBeNull();
    });
  });

  describe("withdrawBuyer", () => {
    it("로컬 계정은 password를 포함하여 탈퇴 요청하고 메모리 토큰을 폐기한다", async () => {
      client.setAccessToken("token-to-destroy", 600);
      const postJsonSpy = vi.spyOn(client, "apiPostJson").mockResolvedValue(undefined);
      vi.spyOn(client, "refreshCsrfSilently").mockResolvedValue();

      await withdrawBuyer("CurrentPassword123!");
      expect(postJsonSpy).toHaveBeenCalledWith("/api/buyer/withdrawal", {
        password: "CurrentPassword123!",
      });
      expect(client.getAccessToken()).toBeNull();
    });

    it("소셜 전용 계정은 password를 생략하고 탈퇴 요청한다", async () => {
      client.setAccessToken("token-to-destroy", 600);
      const postJsonSpy = vi.spyOn(client, "apiPostJson").mockResolvedValue(undefined);
      vi.spyOn(client, "refreshCsrfSilently").mockResolvedValue();

      await withdrawBuyer();
      expect(postJsonSpy).toHaveBeenCalledWith("/api/buyer/withdrawal", {});
      expect(client.getAccessToken()).toBeNull();
    });
  });
});
