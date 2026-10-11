package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AccountController {
  private final AccountService accounts;

  public AccountController(AccountService accounts) {
    this.accounts = accounts;
  }

  @Operation(
      summary = "구매자 가입",
      description = "역할은 구매자로 고정하며 자동 로그인하지 않습니다. X-CSRF-TOKEN 헤더와 세션 쿠키가 필요합니다.")
  @ApiResponse(responseCode = "201", description = "구매자 가입 완료")
  @ApiResponse(responseCode = "400", description = "입력 규칙 위반 또는 잘못된 JSON: INVALID_INPUT")
  @ApiResponse(responseCode = "403", description = "CSRF 토큰 누락·불일치: FORBIDDEN")
  @ApiResponse(responseCode = "409", description = "ID·이메일 중복: DUPLICATE_ACCOUNT")
  @PostMapping("/api/accounts")
  @ResponseStatus(HttpStatus.CREATED)
  public AccountView signup(@RequestBody SignupRequest request) {
    return accounts.signup(
        request.loginId(), request.password(), request.displayName(), request.email());
  }
}
