package com.mirinae.market.modules.account.presentation;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.MemberView;
import io.swagger.v3.oas.annotations.Operation;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;

@RestController
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "sessionCookie")
public class SellerAccountController {
  private final AccountService accounts;

  public SellerAccountController(AccountService accounts) {
    this.accounts = accounts;
  }

  @Operation(
      summary = "판매자 본인 정보 조회",
      description = "판매자 본인의 이메일·담당자 정보를 반환합니다. 미로그인 401, 다른 역할 403입니다.")
  @GetMapping("/api/seller/profile")
  public MemberView profile(Principal principal) {
    return accounts.profile(principal.getName());
  }

  @Operation(
      summary = "판매자 본인 비밀번호 변경",
      description =
          "현재 비밀번호와 다른 유효한 새 비밀번호가 필요합니다. 성공하면 첫 비밀번호 변경 제한을 해제합니다. 입력 오류 400, CSRF 오류 403입니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PutMapping("/api/seller/password")
  public java.util.Map<String, Boolean> password(
      Principal principal, @RequestBody PasswordInput input) {
    accounts.changePassword(principal.getName(), input.currentPassword(), input.newPassword());
    return java.util.Map.of("changed", true);
  }

  public record PasswordInput(String currentPassword, String newPassword) {}
}
