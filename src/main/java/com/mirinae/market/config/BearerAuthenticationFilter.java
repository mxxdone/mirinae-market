package com.mirinae.market.config;

import com.mirinae.market.modules.auth.business.AuthService;
import com.mirinae.market.modules.auth.business.AuthenticatedUser;
import com.mirinae.market.modules.auth.data.AuthStorageUnavailableException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authorization: Bearer access를 검증해 인증 주체를 구성한다. 보호 요청은 인증 후 현재 계정의 활성 여부·권한을 다시 확인하며, 서블릿 필터로 자동
 * 등록하지 않고 SecurityFilterChain 안에서만 실행한다. 인증 저장소 장애는 인증 우회 없이 503으로 응답한다.
 */
public class BearerAuthenticationFilter extends OncePerRequestFilter {
  private final AuthService auth;

  public BearerAuthenticationFilter(AuthService auth) {
    this.auth = auth;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")) {
      AuthenticatedUser user;
      try {
        user = auth.authenticate(header.substring(7));
      } catch (AuthStorageUnavailableException unavailable) {
        unavailable(response);
        return;
      } catch (
          com.mirinae.market.modules.account.business.AccountUnavailableException unavailable) {
        // Redis·DB 모두 인증 판단 불가이면 자격 증명 불일치(401)와 구분해 503으로 닫는다.
        unavailable(response);
        return;
      }
      if (user != null) {
        SecurityContextHolder.getContext()
            .setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role()))));
        request.setAttribute("mirinae.sid", user.sid());
      }
    }
    chain.doFilter(request, response);
  }

  private static void unavailable(HttpServletResponse response) throws IOException {
    response.setStatus(503);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding("UTF-8");
    response.setHeader("Cache-Control", "no-store");
    response
        .getWriter()
        .write(
            "{\"code\":\"AUTH_UNAVAILABLE\",\"message\":\"인증 서버를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.\"}");
  }
}
