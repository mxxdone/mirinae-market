package com.mirinae.market.modules.withdrawal.presentation;

import com.mirinae.market.modules.withdrawal.business.WithdrawalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.Principal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WithdrawalController {
  private final WithdrawalService service;

  public WithdrawalController(WithdrawalService service) {
    this.service = service;
  }

  public record WithdrawalInput(
      @Schema(
              description = "현재 비밀번호. 탈퇴 확인에만 사용하며 저장하지 않습니다.",
              accessMode = Schema.AccessMode.WRITE_ONLY)
          String password) {}

  @Operation(
      summary = "구매자 회원 탈퇴",
      description =
          "현재 비밀번호를 확인하고 미완료 결제·수령 대기 주문·환불이 없으면 탈퇴합니다. 거래 기록과 사용한 로그인 아이디는 보존하며 개인정보를 정리합니다. 성공 시 현재 세션을 종료하고 다른 세션도 이후 요청부터 거절합니다.")
  @SecurityRequirement(name = "sessionCookie")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "204", description = "탈퇴 완료·현재 세션 종료")
  @ApiResponse(responseCode = "400", description = "INVALID_INPUT: 비밀번호 누락·불일치")
  @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED: 미로그인·탈퇴한 계정")
  @ApiResponse(responseCode = "403", description = "구매자 역할 또는 CSRF 권한 없음")
  @ApiResponse(responseCode = "409", description = "WITHDRAWAL_BLOCKED: 미완료 거래 있음. 변경 없음")
  @PostMapping("/api/buyer/withdrawal")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void withdraw(
      Principal actor,
      @RequestBody WithdrawalInput input,
      HttpServletRequest request,
      HttpServletResponse response) {
    service.withdraw(actor.getName(), input.password());
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    new SecurityContextLogoutHandler().logout(request, response, authentication);
    new CookieClearingLogoutHandler("JSESSIONID").logout(request, response, authentication);
  }
}
