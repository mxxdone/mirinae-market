package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.AccountAuthGateway;
import com.mirinae.market.modules.account.business.AccountSummary;
import com.mirinae.market.modules.auth.business.AuthPolicy;
import com.mirinae.market.modules.auth.business.AuthService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.savedrequest.NullRequestCache;

/**
 * JWT 기반 인증 구성이다. 서버 세션·formLogin은 사용하지 않으며 CSRF는 HttpOnly 쿠키와 평문 비교 핸들러로 검사한다. logout은 public
 * controller가 자격 증명을 직접 검증하므로 여기서 Bearer 선인증으로 막지 않는다.
 */
@Configuration
public class SecurityConfig {
  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      AuthService auth,
      CsrfTokenRepository csrfRepository,
      CsrfTokenRequestAttributeHandler csrfHandler,
      AccountAuthGateway accounts)
      throws Exception {
    http.sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(
            csrf ->
                csrf.csrfTokenRepository(csrfRepository)
                    .csrfTokenRequestHandler(csrfHandler)
                    // 자체 JWT + STATELESS 구성에서는 매 Bearer 인증마다 세션 고정 방지용 CSRF 폐기를 수행하지 않는다.
                    // 이 전략을 지정하지 않으면 기본 CsrfAuthenticationStrategy가 로그인 직후 CSRF 쿠키를 삭제해
                    // 이후 변경 요청이 모두 403이 된다. CSRF 헤더 검증 자체는 그대로 유지된다.
                    .sessionAuthenticationStrategy(new NullAuthenticatedSessionStrategy()))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(org.springframework.http.HttpMethod.GET, "/media/products/**")
                    .permitAll()
                    .requestMatchers(
                        org.springframework.http.HttpMethod.GET,
                        "/api/accounts/login-id-availability")
                    .permitAll()
                    .requestMatchers(
                        "/actuator/health",
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/swagger-ui.html",
                        "/error")
                    .permitAll()
                    .requestMatchers("/api/auth/**")
                    .permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/accounts")
                    .permitAll()
                    .requestMatchers("/api/admin/**")
                    .hasRole("ADMIN")
                    .requestMatchers("/api/seller/profile", "/api/seller/password")
                    .hasRole("SELLER")
                    .requestMatchers("/api/buyer/**")
                    .hasRole("BUYER")
                    .requestMatchers("/api/seller/**")
                    .access(
                        (authentication, context) -> {
                          var authenticated = authentication.get();
                          boolean seller =
                              authenticated.getAuthorities().stream()
                                  .anyMatch(a -> a.getAuthority().equals("ROLE_SELLER"));
                          return new org.springframework.security.authorization
                              .AuthorizationDecision(
                              seller && !requiresPasswordChange(accounts, authenticated.getName()));
                        })
                    .anyRequest()
                    .authenticated())
        .requestCache(cache -> cache.requestCache(new NullRequestCache()))
        .formLogin(form -> form.disable())
        .httpBasic(basic -> basic.disable())
        .logout(logout -> logout.disable())
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(
                        (request, response, exception) ->
                            error(response, 401, "UNAUTHENTICATED", "로그인이 필요합니다."))
                    .accessDeniedHandler(
                        (request, response, exception) ->
                            error(response, 403, "FORBIDDEN", "요청 권한 또는 CSRF 토큰이 올바르지 않습니다.")));
    http.addFilterBefore(new BearerAuthenticationFilter(auth), AnonymousAuthenticationFilter.class);
    return http.build();
  }

  /**
   * 서버 세션 없이 동작하는 표준 HttpOnly CSRF 쿠키 저장소다. 표준 구현은 기존 쿠키가 있으면 회전하지 않으므로 GET /api/auth/csrf 응답 본문
   * 토큰과 쿠키 값이 일치한다. 로그인 직후 삭제는 저장소가 아니라 CSRF 체인의 인증 전략 설정에서 다룬다.
   */
  @Bean
  public CsrfTokenRepository csrfRepository(AuthPolicy policy) {
    CookieCsrfTokenRepository repository = new CookieCsrfTokenRepository();
    repository.setCookieName("MIRINAE_CSRF");
    repository.setHeaderName("X-CSRF-TOKEN");
    repository.setCookiePath("/");
    repository.setCookieCustomizer(
        cookie -> cookie.httpOnly(true).sameSite("Lax").secure(policy.cookieSecure()));
    return repository;
  }

  /** 쿠키 값과 헤더 값을 마스킹 없이 그대로 비교한다. */
  @Bean
  public CsrfTokenRequestAttributeHandler csrfHandler() {
    return new CsrfTokenRequestAttributeHandler();
  }

  private static boolean requiresPasswordChange(AccountAuthGateway accounts, String loginId) {
    try {
      AccountSummary summary = accounts.summary(loginId);
      return summary.requiresPasswordChange();
    } catch (com.mirinae.market.modules.account.business.AccountInactiveException
        | IllegalArgumentException exception) {
      // 비활성·소멸 계정은 인증 필터가 이미 거절하므로 여기서는 보수적으로 제한한다.
      return true;
    }
  }

  private static void error(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    response.setHeader("Cache-Control", "no-store");
    response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
  }
}
