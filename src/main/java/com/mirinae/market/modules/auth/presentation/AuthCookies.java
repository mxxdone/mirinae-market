package com.mirinae.market.modules.auth.presentation;

import com.mirinae.market.modules.auth.business.AuthPolicy;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** 인증 쿠키를 설정·삭제한다. 비밀값은 HttpOnly이며 브라우저 저장소나 URL로 전달하지 않는다. */
@Component
public class AuthCookies {
  private final AuthPolicy policy;

  public AuthCookies(AuthPolicy policy) {
    this.policy = policy;
  }

  String refresh(HttpServletRequest request) {
    return value(request, policy.refreshCookieName());
  }

  String browserBinding(HttpServletRequest request) {
    return value(request, policy.browserCookieName());
  }

  String flowId(HttpServletRequest request) {
    return value(request, policy.flowCookieName());
  }

  /** refresh 쿠키를 /api/auth 경로에 설정한다. */
  void refresh(HttpServletResponse response, String value, Duration maxAge) {
    write(response, policy.refreshCookieName(), value, "/api/auth", maxAge, true);
  }

  void clearRefresh(HttpServletResponse response) {
    write(response, policy.refreshCookieName(), "", "/api/auth", Duration.ZERO, true);
  }

  /** OAuth 브라우저 바인딩 쿠키를 설정한다. */
  void browserBinding(HttpServletResponse response, String value, Duration maxAge) {
    write(response, policy.browserCookieName(), value, "/api/auth/oauth", maxAge, true);
  }

  /** OAuth 흐름 쿠키를 설정한다. /api 경로라 탈퇴 요청에서도 읽을 수 있다. */
  void flow(HttpServletResponse response, String value, Duration maxAge) {
    write(response, policy.flowCookieName(), value, "/api", maxAge, true);
  }

  void clearFlow(HttpServletResponse response) {
    write(response, policy.flowCookieName(), "", "/api", Duration.ZERO, true);
  }

  private void write(
      HttpServletResponse response,
      String name,
      String value,
      String path,
      Duration maxAge,
      boolean httpOnly) {
    ResponseCookie cookie =
        ResponseCookie.from(name, value)
            .httpOnly(httpOnly)
            .secure(policy.cookieSecure())
            .sameSite("Lax")
            .path(path)
            .maxAge(maxAge)
            .build();
    response.addHeader("Set-Cookie", cookie.toString());
  }

  private static String value(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return null;
    for (Cookie cookie : cookies) {
      if (cookie.getName().equals(name)) return cookie.getValue();
    }
    return null;
  }
}
