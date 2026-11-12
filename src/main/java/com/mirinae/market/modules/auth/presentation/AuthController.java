package com.mirinae.market.modules.auth.presentation;

import com.mirinae.market.modules.auth.business.AuthException;
import com.mirinae.market.modules.auth.business.AuthMe;
import com.mirinae.market.modules.auth.business.AuthService;
import com.mirinae.market.modules.auth.business.AuthenticatedUser;
import com.mirinae.market.modules.auth.business.OAuthFlowView;
import com.mirinae.market.modules.auth.business.OAuthService;
import com.mirinae.market.modules.auth.business.SignupOutcome;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 인증 HTTP 계약이다. logout은 인증 필터의 Bearer 선인증 없이 이 컨트롤러가 자격 증명을 직접 검증한다. */
@RestController
public class AuthController {
  private final AuthService auth;
  private final OAuthService oauth;
  private final AuthCookies cookies;

  public AuthController(AuthService auth, OAuthService oauth, AuthCookies cookies) {
    this.auth = auth;
    this.oauth = oauth;
    this.cookies = cookies;
  }

  @Operation(
      summary = "현재 사용자 조회",
      description = "Authorization: Bearer access로 조회합니다. 본인에게만 로그인 수단을 제공합니다.")
  @SecurityRequirement(name = "bearerAuth")
  @ApiResponse(responseCode = "200", description = "현재 계정 정보")
  @ApiResponse(responseCode = "401", description = "미로그인·만료·폐기: UNAUTHENTICATED")
  @GetMapping("/api/auth/me")
  public AuthMe current(@AuthenticationPrincipal AuthenticatedUser user) {
    if (user == null) throw AuthException.unauthenticated();
    return auth.me(user);
  }

  @Operation(
      summary = "CSRF 토큰 조회",
      description = "서버 세션 없이 호출합니다. 반환된 headerName 헤더에 token을 전송합니다. HttpOnly 쿠키로 검증합니다.")
  @GetMapping("/api/auth/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    // 저장소가 HttpOnly 쿠키를 직접 발급·갱신하며 응답 본문은 JS 메모리용 토큰만 제공한다.
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }

  @Operation(
      summary = "로그아웃",
      description =
          "CSRF와 유효한 Bearer 또는 refresh 쿠키로 현재 로그인 상태를 폐기합니다. 이미 만료·유실이어도 쿠키를 지우고 204를 반환합니다.")
  @SecurityRequirement(name = "bearerAuth")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/auth/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(HttpServletRequest request, HttpServletResponse response) {
    String since = request.getHeader("Authorization");
    String access = since != null && since.startsWith("Bearer ") ? since.substring(7) : null;
    auth.logout(access, cookies.refresh(request));
    cookies.clearRefresh(response);
    cookies.clearFlow(response);
  }

  @Operation(
      summary = "토큰 갱신",
      description =
          "refresh 쿠키와 CSRF로 access를 복원하고 회전된 refresh 쿠키를 발급합니다. 쿠키 수명은 최초 인증 절대 기한을 넘지 않습니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/auth/refresh")
  public ResponseEntity<Map<String, Object>> refresh(
      HttpServletRequest request, HttpServletResponse response) {
    AuthService.Refreshed refreshed = auth.refresh(cookies.refresh(request));
    // 회전 시에도 쿠키 maxAge는 남은 절대 기한으로 제한한다.
    cookies.refresh(response, refreshed.refreshToken(), refreshed.refreshRemaining());
    return noStore(loginBody(refreshed.accessToken(), refreshed.accessTtl(), refreshed.role()));
  }

  @Operation(
      summary = "로그인",
      description =
          "폼 loginId/password로 인증하고 access JWT와 refresh HttpOnly 쿠키를 발급합니다. 역할별 첫 비밀번호 변경 제한은 유지합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping(
      path = "/api/auth/login",
      consumes = org.springframework.http.MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  public ResponseEntity<Map<String, Object>> login(
      @org.springframework.web.bind.annotation.RequestParam String loginId,
      @org.springframework.web.bind.annotation.RequestParam String password,
      HttpServletResponse response) {
    AuthService.LoginResult issued = auth.login(loginId, password);
    cookies.refresh(response, issued.refreshToken(), auth.policy().absoluteTtl());
    return noStore(loginBody(issued.accessToken(), issued.accessTtl(), issued.role()));
  }

  @Operation(
      summary = "소셜 로그인 제공자 목록",
      description = "실제 설정이 완전한 제공자만 반환합니다. 카카오는 어드민 키까지 있어야 노출합니다.")
  @GetMapping("/api/auth/oauth/providers")
  public Map<String, List<String>> providers() {
    return Map.of("providers", oauth.providers());
  }

  @Operation(
      summary = "소셜 흐름 시작",
      description =
          "JSON {purpose}에 따라 authorizationUrl을 발급합니다. login은 익명, link는 미완료 연결 흐름, withdraw는 구매자 Bearer가 필요합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/auth/oauth/{provider}/start")
  public Map<String, String> start(
      @PathVariable String provider,
      @RequestBody StartInput input,
      @AuthenticationPrincipal AuthenticatedUser user,
      HttpServletRequest request,
      HttpServletResponse response) {
    OAuthService.StartResult result =
        oauth.start(
            provider,
            input == null ? null : input.purpose(),
            cookies.browserBinding(request),
            cookies.flowId(request),
            user,
            auth.policy());
    if (result.browserBinding() != null) {
      cookies.browserBinding(response, result.browserBinding(), auth.policy().stateTtl());
    }
    if (result.flowId() != null) {
      // 흐름 쿠키 수명은 넉넉히 두고 실제 만료는 Redis TTL(연결 10분·재인증 5분)이 결정한다.
      cookies.flow(response, result.flowId(), auth.policy().stateTtl());
    }
    return Map.of("authorizationUrl", result.authorizationUrl());
  }

  @Operation(
      summary = "소셜 콜백",
      description = "제공자 콜백을 처리하고 고정 /#oauth 화면으로 이동합니다. callback URL에는 서비스 토큰을 넣지 않습니다.")
  @GetMapping("/api/auth/oauth/{provider}/callback")
  public ResponseEntity<Void> callback(
      @PathVariable String provider,
      @org.springframework.web.bind.annotation.RequestParam(required = false) String code,
      @org.springframework.web.bind.annotation.RequestParam(required = false) String state,
      @org.springframework.web.bind.annotation.RequestParam(required = false) String error,
      HttpServletRequest request,
      HttpServletResponse response) {
    OAuthService.CallbackResult result =
        oauth.callback(
            provider, code, error, state, cookies.browserBinding(request), auth.policy());
    cookies.flow(response, result.flowId(), auth.policy().stateTtl());
    if (result.login() != null) {
      cookies.refresh(response, result.login().refreshToken(), auth.policy().absoluteTtl());
    }
    return noStoreRedirect("/#oauth");
  }

  @Operation(
      summary = "소셜 흐름 상태",
      description = "HttpOnly 흐름 쿠키로 조회하며 서버 확인 정보만 반환합니다. 만료는 200 ERROR입니다.")
  @GetMapping("/api/auth/oauth/flow")
  public Map<String, Object> flow(HttpServletRequest request) {
    OAuthFlowView flow = oauth.flow(cookies.flowId(request));
    var body = new java.util.LinkedHashMap<String, Object>();
    body.put("status", flow.status());
    if (flow.provider() != null) body.put("provider", flow.provider());
    if (flow.displayName() != null) body.put("displayName", flow.displayName());
    if (flow.email() != null) body.put("email", flow.email());
    if (flow.message() != null) body.put("message", flow.message());
    body.put("linkVerified", flow.linkVerified());
    return body;
  }

  @Operation(
      summary = "소셜 신규 가입",
      description = "표시 이름·이메일을 확인해 비밀번호 없는 구매자를 만들고 즉시 로그인합니다. 같은 이메일의 기존 회원이면 409와 연결 흐름을 안내합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/auth/oauth/signup")
  public ResponseEntity<Map<String, Object>> signup(
      @RequestBody SignupInput input, HttpServletRequest request, HttpServletResponse response) {
    SignupOutcome outcome;
    try {
      outcome = oauth.signup(input.displayName(), input.email(), cookies.flowId(request));
    } catch (AuthException exception) {
      if (exception.flowId() != null) {
        cookies.flow(response, exception.flowId(), auth.policy().stateTtl());
      }
      throw exception;
    }
    if (outcome instanceof SignupOutcome.LinkRequired linkRequired) {
      // 이전 흐름을 소비했으므로 새 연결 흐름 HttpOnly 쿠키를 설정해야 UI가 flow GET으로 연결 화면에 들어갈 수 있다.
      cookies.flow(response, linkRequired.flowId(), auth.policy().stateTtl());
      var body = new java.util.LinkedHashMap<String, Object>();
      body.put("code", "LINK_REQUIRED");
      body.put("message", "같은 이메일의 기존 계정이 있습니다. 계정 연결을 확인해 주세요.");
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .header("Cache-Control", "no-store")
          .body(body);
    }
    AuthService.LoginResult issued = ((SignupOutcome.Success) outcome).tokens();
    cookies.refresh(response, issued.refreshToken(), auth.policy().absoluteTtl());
    cookies.clearFlow(response);
    return noStore(loginBody(issued.accessToken(), issued.accessTtl(), issued.role()));
  }

  @Operation(
      summary = "기존 계정 소셜 연결",
      description = "로컬 자격 증명 또는 기존 소셜 재인증 증명과 명시적 동의로 기존 구매자에 로그인 수단을 추가합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/auth/oauth/link")
  public ResponseEntity<Map<String, Object>> link(
      @RequestBody LinkInput input, HttpServletRequest request, HttpServletResponse response) {
    AuthService.LoginResult issued =
        oauth.link(
            cookies.flowId(request),
            input != null && Boolean.TRUE.equals(input.confirm()),
            input == null ? null : input.loginId(),
            input == null ? null : input.password());
    cookies.refresh(response, issued.refreshToken(), auth.policy().absoluteTtl());
    cookies.clearFlow(response);
    return noStore(loginBody(issued.accessToken(), issued.accessTtl(), issued.role()));
  }

  private static Map<String, Object> loginBody(String accessToken, Duration ttl, String role) {
    return Map.of(
        "authenticated",
        true,
        "accessToken",
        accessToken,
        "expiresIn",
        ttl.toSeconds(),
        "role",
        role);
  }

  private static ResponseEntity<Map<String, Object>> noStore(Map<String, Object> body) {
    return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
  }

  private static ResponseEntity<Void> noStoreRedirect(String location) {
    return ResponseEntity.status(HttpStatus.FOUND)
        .header("Cache-Control", "no-store")
        .header("Location", location)
        .build();
  }

  public record StartInput(String purpose) {}

  public record SignupInput(String displayName, String email) {}

  public record LinkInput(Boolean confirm, String loginId, String password) {}
}
