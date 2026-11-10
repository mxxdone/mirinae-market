package com.mirinae.market.config;

import com.mirinae.market.modules.account.business.AccountService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.filter.OncePerRequestFilter;

// 서블릿 필터로 자동 등록하지 않고 SecurityFilterChain 안에서만 인증 후 실행한다.
final class ActiveAccountFilter extends OncePerRequestFilter {
  private final AccountService accounts;

  ActiveAccountFilter(AccountService accounts) {
    this.accounts = accounts;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null
        && authentication.isAuthenticated()
        && !(authentication instanceof AnonymousAuthenticationToken)
        && !accounts.isActive(authentication.getName())) {
      new SecurityContextLogoutHandler().logout(request, response, authentication);
      new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, authentication);
      response.setStatus(401);
      response.setContentType("application/json;charset=UTF-8");
      response
          .getWriter()
          .write("{\"code\":\"UNAUTHENTICATED\",\"message\":\"로그인할 수 없는 계정입니다. 다시 로그인해 주세요.\"}");
      return;
    }
    chain.doFilter(request, response);
  }
}
