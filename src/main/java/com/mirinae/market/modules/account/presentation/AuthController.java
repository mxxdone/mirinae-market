package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.security.Principal;
import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
  private final AccountService accounts;

  public AuthController(AccountService accounts) {
    this.accounts = accounts;
  }

  @Operation(summary = "현재 사용자 조회", description = "로그인 후 발급된 JSESSIONID 쿠키로 조회합니다.")
  @ApiResponse(responseCode = "200", description = "현재 계정 정보")
  @ApiResponse(responseCode = "401", description = "미로그인·세션 만료: UNAUTHENTICATED")
  @GetMapping("/api/auth/me")
  public AccountView current(Principal principal) {
    return accounts.current(principal.getName());
  }

  @Operation(
      summary = "CSRF 토큰 조회",
      description =
          "미로그인 상태에서도 호출합니다. 반환된 headerName 헤더에 token을 전송하고 JSESSIONID 쿠키를 유지합니다. 로그인·로그아웃 후 다시 조회합니다.")
  @GetMapping("/api/auth/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }
}
