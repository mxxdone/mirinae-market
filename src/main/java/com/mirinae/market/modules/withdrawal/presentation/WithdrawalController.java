package com.mirinae.market.modules.withdrawal.presentation;

import com.mirinae.market.modules.withdrawal.business.WithdrawalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.Principal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 구매자 탈퇴 HTTP 계약이다. 인증 필터가 확정한 loginId·sid만 사용하고 쿠키 삭제는 presentation의 설정값으로 처리한다. */
@RestController
public class WithdrawalController {
  private final WithdrawalService service;
  private final String flowCookieName;
  private final String refreshCookieName;
  private final boolean cookieSecure;

  public WithdrawalController(
      WithdrawalService service,
      @Value("${auth.cookie.flow-name}") String flowCookieName,
      @Value("${auth.cookie.refresh-name}") String refreshCookieName,
      @Value("${auth.cookie.secure:false}") boolean cookieSecure) {
    this.service = service;
    this.flowCookieName = flowCookieName;
    this.refreshCookieName = refreshCookieName;
    this.cookieSecure = cookieSecure;
  }

  public record WithdrawalInput(
      @Schema(
              description = "현재 비밀번호. 소셜 전용 계정은 생략하며 5분 내 소셜 재인증 확인을 사용합니다.",
              accessMode = Schema.AccessMode.WRITE_ONLY)
          String password) {}

  @Operation(
      summary = "구매자 회원 탈퇴",
      description =
          "미완료 결제·수령 대기 주문·환불이 없고 본인 확인이 끝나면 탈퇴합니다. 카카오 연결은 서비스 탈퇴 확정 전에 해제합니다. 거래 기록과 로그인 아이디는 보존합니다.")
  @SecurityRequirement(name = "bearerAuth")
  @ApiResponse(responseCode = "204", description = "탈퇴 완료·현재 기기 쿠키 삭제")
  @ApiResponse(responseCode = "400", description = "INVALID_INPUT: 비밀번호 누락·불일치")
  @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED: 미로그인·탈퇴한 계정")
  @ApiResponse(responseCode = "403", description = "구매자 역할·CSRF·소셜 재인증 확인 실패")
  @ApiResponse(responseCode = "409", description = "WITHDRAWAL_BLOCKED: 미완료 거래 있음. 변경 없음")
  @ApiResponse(
      responseCode = "500",
      description = "WITHDRAWAL_INCOMPLETE: 제공자 연결 해제 후 로컬 저장 실패. 재시도 안내")
  @ApiResponse(
      responseCode = "502",
      description = "OAUTH_PROVIDER_ERROR: 카카오 연결 해제 실패. 로컬 회원·거래 유지")
  @PostMapping("/api/buyer/withdrawal")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void withdraw(
      Principal actor,
      @RequestBody(required = false) WithdrawalInput input,
      HttpServletRequest request,
      HttpServletResponse response) {
    String sid = (String) request.getAttribute("mirinae.sid");
    String flowId = cookie(request, flowCookieName);
    service.withdraw(actor.getName(), input == null ? null : input.password(), flowId, sid);
    clear(response, refreshCookieName, "/api/auth");
    clear(response, flowCookieName, "/api");
  }

  private static String cookie(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return null;
    for (Cookie cookie : cookies) {
      if (cookie.getName().equals(name)) return cookie.getValue();
    }
    return null;
  }

  private void clear(HttpServletResponse response, String name, String path) {
    response.addHeader(
        "Set-Cookie",
        ResponseCookie.from(name, "")
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path(path)
            .maxAge(java.time.Duration.ZERO)
            .build()
            .toString());
  }
}
