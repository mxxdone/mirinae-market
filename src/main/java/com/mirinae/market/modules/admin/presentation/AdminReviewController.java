package com.mirinae.market.modules.admin.presentation;

import com.mirinae.market.modules.admin.business.AdminReviewPage;
import com.mirinae.market.modules.admin.business.AdminReviewRequestPage;
import com.mirinae.market.modules.admin.business.AdministratorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@SecurityRequirement(name = "bearerAuth")
@ApiResponse(responseCode = "401", description = "미로그인")
@ApiResponse(responseCode = "403", description = "관리자 권한·CSRF 오류")
@ApiResponse(responseCode = "400", description = "페이지·사유·승인 여부 입력 오류")
@ApiResponse(responseCode = "404", description = "리뷰·삭제 요청 없음")
@ApiResponse(responseCode = "409", description = "삭제 요청의 재결정 충돌")
public class AdminReviewController {
  private final AdministratorService service;

  public AdminReviewController(AdministratorService service) {
    this.service = service;
  }

  public record ReasonInput(String reason) {}

  public record DecisionInput(Boolean approved, String reason) {}

  @GetMapping("/reviews")
  @Operation(summary = "리뷰 관리 목록", description = "작성자·관리자 삭제 상태를 포함한 최신순 목록입니다. 기본 20·최대 100건입니다.")
  public AdminReviewPage list(
      Principal actor,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.reviews(actor.getName(), page, size);
  }

  @PostMapping("/reviews/{id}/delete")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "관리자 리뷰 소프트 삭제",
      description = "1~500자 사유를 저장하며 공개·평점에서 제외합니다. 작성자 삭제와 독립적이며 관리자 이력과 원자적으로 저장합니다.")
  public void delete(Principal actor, @PathVariable long id, @RequestBody ReasonInput input) {
    service.deleteReview(actor.getName(), id, input.reason());
  }

  @PostMapping("/reviews/{id}/restore")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "관리자 삭제 해제",
      description = "관리자 삭제만 해제하고 작성자의 삭제는 유지합니다. 변경 이력과 원자적으로 저장합니다.")
  public void restore(Principal actor, @PathVariable long id) {
    service.restoreReview(actor.getName(), id);
  }

  @GetMapping("/review-deletion-requests")
  @Operation(
      summary = "미처리 리뷰 삭제 요청",
      description = "판매자가 제출한 PENDING 요청을 최신순으로 조회합니다. 기본 20·최대 100건입니다.")
  public AdminReviewRequestPage requests(
      Principal actor,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return service.reviewRequests(actor.getName(), page, size);
  }

  @PostMapping("/review-deletion-requests/{id}/decision")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "리뷰 삭제 요청 승인·반려",
      description =
          "approved와 사유 1~500자가 필요합니다. 승인 시 관리자 삭제와 처리·이력을 함께 저장합니다. 동일 처리 재요청은 중복 적용하지 않고 다른 재결정은 409입니다.")
  public AdminReviewRequestPage.Item decide(
      Principal actor, @PathVariable long id, @RequestBody DecisionInput input) {
    if (input.approved() == null) throw new IllegalArgumentException("승인 여부를 입력해 주세요.");
    return service.decideReviewRequest(actor.getName(), id, input.approved(), input.reason());
  }
}
