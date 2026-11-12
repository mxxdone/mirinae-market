package com.mirinae.market.modules.review.presentation;

import com.mirinae.market.modules.review.business.DeletionRequestView;
import com.mirinae.market.modules.review.business.ReviewEditorView;
import com.mirinae.market.modules.review.business.ReviewPage;
import com.mirinae.market.modules.review.business.ReviewService;
import com.mirinae.market.modules.review.business.ReviewSummary;
import com.mirinae.market.modules.review.business.ReviewView;
import com.mirinae.market.modules.review.business.SellerReviewView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.math.BigDecimal;
import java.security.Principal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@SecurityRequirement(name = "bearerAuth")
@ApiResponse(responseCode = "400", description = "별점·본문·페이지·ID 입력 오류: INVALID_INPUT")
@ApiResponse(responseCode = "401", description = "로그인이 필요합니다: UNAUTHENTICATED")
@ApiResponse(responseCode = "403", description = "역할·소유권·CSRF 오류: FORBIDDEN")
@ApiResponse(responseCode = "404", description = "대상 없음·타인 주문·비공개 또는 다른 시장 매장: NOT_FOUND")
@ApiResponse(
    responseCode = "409",
    description = "리뷰 기한·삭제·주문 상태 충돌: REVIEW_STATE_CONFLICT 또는 REVIEW_NOT_ALLOWED")
public class ReviewController {
  private final ReviewService reviews;

  public ReviewController(ReviewService reviews) {
    this.reviews = reviews;
  }

  public record ReviewInput(BigDecimal rating, String content) {}

  public record ContentInput(String content) {}

  public record ReasonInput(String reason) {}

  @GetMapping("/api/markets/{marketId}/stores/{storeId}/reviews")
  @Operation(
      summary = "매장별 구매자 리뷰",
      description =
          "수령 완료 주문에 근거한 공개 리뷰만 최신순으로 반환합니다. 본문·답글과 동일 스냅샷의 매장 평균·개수를 제공합니다. 평균은 소수 첫째 자리, 리뷰 0건은 평균 null·개수 0입니다. 기본 20·최대 100건입니다.")
  public ReviewPage<ReviewView> list(
      @PathVariable long marketId,
      @PathVariable long storeId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return reviews.publicReviews(marketId, storeId, page, size);
  }

  @GetMapping("/api/markets/{marketId}/review-summaries")
  @Operation(
      summary = "목록의 매장 평점 일괄 조회",
      description =
          "storeIds는 양수 1~100개이며 중복은 하나로 집계합니다. 선택 시장의 공개 매장만 허용합니다. 상품별 평점이 아닌 매장별 구매자 리뷰 평균입니다.")
  public List<ReviewSummary> summaries(
      @PathVariable long marketId, @RequestParam List<Long> storeIds) {
    return reviews.summaries(marketId, storeIds);
  }

  @GetMapping("/api/buyer/store-orders/{orderId}/review")
  @Operation(
      summary = "본인 주문의 리뷰 편집 정보",
      description =
          "수령 완료한 본인 주문만 조회합니다. 기존 리뷰는 본인 삭제·관리자 삭제 상태를 포함하며 미작성은 review=null입니다. canCreate와 UTC creationDeadline을 제공합니다.")
  public ReviewEditorView editor(Principal actor, @PathVariable long orderId) {
    return reviews.editor(actor.getName(), orderId);
  }

  @PutMapping("/api/buyer/store-orders/{orderId}/review")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "구매자 리뷰 작성·수정",
      description =
          "별점 정수 1~5·본문 1~1,000자입니다. 수령 완료 후 30일 미만에 신규 작성할 수 있습니다. 주문당 하나이며 기존 공개 리뷰 수정에는 신규 기한을 적용하지 않습니다. 삭제 리뷰는 복구 후 수정합니다.")
  public ReviewEditorView write(
      Principal actor, @PathVariable long orderId, @RequestBody ReviewInput input) {
    return reviews.write(actor.getName(), orderId, input.rating(), input.content());
  }

  @DeleteMapping("/api/buyer/store-orders/{orderId}/review")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "본인 리뷰 소프트 삭제",
      description = "공개·평점에서 제외하며 원본과 답글을 보존합니다. 중복 요청은 추가 삭제를 만들지 않습니다.")
  public void delete(Principal actor, @PathVariable long orderId) {
    reviews.deleteOwn(actor.getName(), orderId);
  }

  @PostMapping("/api/buyer/store-orders/{orderId}/review/restore")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "본인 삭제 리뷰 복구",
      description = "동일 리뷰 ID·답글을 복구합니다. 관리자 삭제 중에는 거절하며 신규 작성 기한은 적용하지 않습니다.")
  public ReviewEditorView restore(Principal actor, @PathVariable long orderId) {
    return reviews.restoreOwn(actor.getName(), orderId);
  }

  @GetMapping("/api/seller/stores/{storeId}/reviews")
  @Operation(
      summary = "본인 매장 리뷰 관리 목록",
      description = "본인 매장 공개 리뷰·평점과 미처리 삭제 요청 여부를 제공합니다. 운영 중지 매장도 본인 관리는 가능합니다.")
  public ReviewPage<SellerReviewView> seller(
      Principal actor,
      @PathVariable long storeId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return reviews.sellerReviews(actor.getName(), storeId, page, size);
  }

  @PutMapping("/api/seller/stores/{storeId}/reviews/{reviewId}/reply")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "판매자 답글 하나 작성·수정",
      description = "본인 매장 공개 리뷰만 허용하며 1~1,000자입니다. 재작성은 같은 답글을 수정합니다.")
  public ReviewView reply(
      Principal actor,
      @PathVariable long storeId,
      @PathVariable long reviewId,
      @RequestBody ContentInput input) {
    return reviews.reply(actor.getName(), storeId, reviewId, input.content());
  }

  @PostMapping("/api/seller/stores/{storeId}/reviews/{reviewId}/deletion-requests")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "판매자 리뷰 삭제 요청",
      description =
          "사유 1~500자가 필요합니다. 미처리 요청은 리뷰당 하나이며 중복 시 기존 요청을 반환합니다. 요청만으로 리뷰를 숨기거나 평점에서 제외하지 않습니다.")
  public DeletionRequestView request(
      Principal actor,
      @PathVariable long storeId,
      @PathVariable long reviewId,
      @RequestBody ReasonInput input) {
    return reviews.requestDeletion(actor.getName(), storeId, reviewId, input.reason());
  }
}
