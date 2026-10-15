package com.mirinae.market.config;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;

@Configuration
public class SecurityConfig {
  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http.authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(
                        "/actuator/health",
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/api/auth/csrf",
                        "/error")
                    .permitAll()
                    .requestMatchers(
                        org.springframework.http.HttpMethod.POST,
                        "/api/accounts",
                        "/api/auth/login")
                    .permitAll()
                    .requestMatchers("/api/buyer/**")
                    .hasRole("BUYER")
                    .requestMatchers("/api/seller/**")
                    .hasRole("SELLER")
                    .anyRequest()
                    .authenticated())
        .csrf(csrf -> csrf.csrfTokenRepository(new HttpSessionCsrfTokenRepository()))
        .requestCache(cache -> cache.requestCache(new NullRequestCache()))
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(
                        (request, response, exception) ->
                            error(response, 401, "UNAUTHENTICATED", "로그인이 필요합니다."))
                    .accessDeniedHandler(
                        (request, response, exception) ->
                            error(response, 403, "FORBIDDEN", "요청 권한 또는 CSRF 토큰이 올바르지 않습니다.")))
        .formLogin(
            login ->
                login
                    .loginPage("/api/auth/login")
                    .loginProcessingUrl("/api/auth/login")
                    .usernameParameter("loginId")
                    .successHandler(
                        (request, response, authentication) -> {
                          response.setContentType("application/json;charset=UTF-8");
                          response.getWriter().write("{\"authenticated\":true}");
                        })
                    .failureHandler(
                        (request, response, exception) ->
                            error(response, 401, "INVALID_CREDENTIALS", "ID 또는 비밀번호가 올바르지 않습니다.")))
        .logout(
            logout ->
                logout
                    .logoutUrl("/api/auth/logout")
                    .deleteCookies("JSESSIONID")
                    .logoutSuccessHandler(
                        (request, response, authentication) -> response.setStatus(204)));
    return http.build();
  }

  private static void error(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
  }
}
