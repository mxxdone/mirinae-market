package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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

  @Operation(
      summary = "구매자 본인 계정 정보 변경",
      description =
          "현재 비밀번호와 새 비밀번호, 확인 값을 제출합니다. 표시 이름을 함께 제출하면 한 번에 저장합니다. 표시 이름과 새 비밀번호에 가입 규칙을 적용하며 비밀번호 변경 성공 시 모든 기기의 인증이 종료됩니다.")
  @SecurityRequirement(name = "bearerAuth")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "저장 후 표시 이름: {displayName}")
  @ApiResponse(
      responseCode = "400",
      description = "변경 사항 누락, 입력 규칙 위반, 현재 비밀번호 오류 또는 소셜 전용 계정의 비밀번호 변경 요청: INVALID_INPUT")
  @ApiResponse(responseCode = "401", description = "미로그인·만료·폐기 또는 탈퇴한 계정: UNAUTHENTICATED")
  @ApiResponse(responseCode = "403", description = "구매자 외 역할 또는 CSRF 토큰 누락·불일치: FORBIDDEN")
  @PatchMapping("/api/buyer/settings")
  public ResponseEntity<Map<String, String>> changeBuyerProfile(
      Principal principal, @RequestBody BuyerProfileInput input) {
    if (input.password() == null) throw new IllegalArgumentException("변경할 비밀번호를 입력해 주세요.");
    String displayName =
        accounts.updateBuyerProfile(
            principal.getName(), input.displayName(), input.password().toBusiness());
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(Map.of("displayName", displayName));
  }

  @Operation(summary = "구매자 표시 이름 변경", description = "본인 표시 이름만 변경하며 기존 인증은 유지합니다.")
  @SecurityRequirement(name = "bearerAuth")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "저장한 표시 이름: {displayName}")
  @ApiResponse(responseCode = "400", description = "이름 누락·길이·문자 규칙 위반: INVALID_INPUT")
  @ApiResponse(responseCode = "401", description = "미인증 또는 만료: UNAUTHENTICATED")
  @ApiResponse(responseCode = "403", description = "구매자 외 역할 또는 CSRF 위반: FORBIDDEN")
  @PatchMapping("/api/buyer/profile")
  public ResponseEntity<Map<String, String>> changeDisplayName(
      Principal principal, @RequestBody DisplayNameInput input) {
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(
            Map.of(
                "displayName",
                accounts.changeBuyerDisplayName(principal.getName(), input.displayName())));
  }

  public record DisplayNameInput(
      @Schema(
              description = "2~10자의 한글·영문·숫자",
              example = "시장손님",
              minLength = 2,
              maxLength = 10,
              requiredMode = Schema.RequiredMode.REQUIRED)
          String displayName) {}

  public record BuyerProfileInput(
      @Schema(
              description = "2~10자의 완성형 한글·영문·숫자. 앞뒤 공백·특수문자·이모지 불가",
              example = "시장손님",
              minLength = 2,
              maxLength = 10)
          String displayName,
      @Schema(
              description = "변경할 비밀번호",
              accessMode = Schema.AccessMode.WRITE_ONLY,
              requiredMode = Schema.RequiredMode.REQUIRED)
          PasswordInput password) {}

  public record PasswordInput(
      @Schema(
              description = "현재 비밀번호",
              format = "password",
              requiredMode = Schema.RequiredMode.REQUIRED)
          String currentPassword,
      @Schema(
              description = "공백 없이 영문·숫자·특수문자를 포함한 새 비밀번호",
              format = "password",
              minLength = 8,
              maxLength = 32,
              requiredMode = Schema.RequiredMode.REQUIRED)
          String newPassword,
      @Schema(
              description = "새 비밀번호 확인",
              format = "password",
              requiredMode = Schema.RequiredMode.REQUIRED)
          String confirmation) {
    AccountService.PasswordChange toBusiness() {
      return new AccountService.PasswordChange(currentPassword, newPassword, confirmation);
    }
  }
}
