package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AccountController {
  private final AccountService accounts;

  public AccountController(AccountService accounts) {
    this.accounts = accounts;
  }

  @Operation(
      summary = "로그인 아이디 사전 중복 확인",
      description =
          "가입 전 사용 가능 여부만 확인합니다. 영문 소문자와 숫자 5~20자가 아니면 400입니다. 조회 결과는 예약이 아니며 최종 가입 시 유일성이 다시 검사됩니다.")
  @ApiResponse(responseCode = "200", description = "조회 완료: available=true는 사용 가능, false는 중복")
  @ApiResponse(responseCode = "400", description = "아이디 형식 위반: INVALID_INPUT")
  @GetMapping("/api/accounts/login-id-availability")
  public ResponseEntity<Map<String, Boolean>> loginIdAvailability(
      @Parameter(description = "확인할 로그인 아이디. 영문 소문자·숫자 5~20자", example = "buyer01") @RequestParam
          String loginId) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(Map.of("available", accounts.loginIdAvailable(loginId)));
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
