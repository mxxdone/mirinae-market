package com.mirinae.market.modules.checkout.presentation;

import com.mirinae.market.modules.checkout.business.CartView;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.checkout.business.CheckoutView;
import com.mirinae.market.modules.checkout.business.StatementView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/buyer")
@SecurityRequirement(name = "sessionCookie")
public class CheckoutController {
  private final CheckoutService service;

  public CheckoutController(CheckoutService service) {
    this.service = service;
  }

  public record CartRequest(Long marketId, Integer quantity) {}

  public record PaymentRequest(String requestKey, Long cartVersion, String mode) {}

  @Operation(
      summary = "본인 장바구니 조회",
      description = "장바구니는 재고를 선점하지 않습니다. 변경된 가격·시간과 주문 가능 여부를 함께 반환합니다.")
  @GetMapping("/cart")
  public CartView cart(Principal principal) {
    return service.cart(principal.getName());
  }

  @Operation(
      summary = "장바구니 상품 담기·수량 수정·조건 재확인",
      description = "같은 시장·수령일 상품을 최대 100개 담습니다. 양의 정수 수량과 현재 가격·수령 조건을 저장합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PutMapping("/cart/items/{offerId}")
  public CartView put(
      Principal principal, @PathVariable long offerId, @RequestBody CartRequest request) {
    if (request.marketId() == null) throw new IllegalArgumentException("시장을 지정해 주세요.");
    return service.put(principal.getName(), request.marketId(), offerId, request.quantity());
  }

  @Operation(summary = "장바구니 상품 제거")
  @SecurityRequirement(name = "csrfToken")
  @DeleteMapping("/cart/items/{offerId}")
  public CartView remove(Principal principal, @PathVariable long offerId) {
    return service.remove(principal.getName(), offerId);
  }

  @Operation(summary = "장바구니 비우기")
  @SecurityRequirement(name = "csrfToken")
  @DeleteMapping("/cart")
  public CartView clear(Principal principal) {
    return service.clear(principal.getName());
  }

  @Operation(
      summary = "통합 모의 결제",
      description =
          "요청 키·장바구니 버전·모의 유형 SUCCESS/FAIL/DELAY/LOST_RESPONSE를 제출합니다. 품절·조건 변경·마감은 FAILED 결과와 원인 코드로 반환하며 전체 미적용합니다. DELAY는 3초 후 재검사하며 재고 선점은 없습니다. LOST_RESPONSE는 성공 저장 후 첫 응답만 503으로 유실을 재현합니다. 같은 키·같은 요청은 기존 결과이며 다른 내용은 409입니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "PENDING/CONFIRMED/FAILED 결제 상태")
  @ApiResponse(
      responseCode = "409",
      description = "CART_CHANGED/CHECKOUT_PENDING/REQUEST_KEY_CONFLICT: 상태 재확인 필요")
  @ApiResponse(responseCode = "503", description = "모의 응답 유실. 실패로 단정하지 말고 같은 요청 키로 결과 조회")
  @PostMapping("/checkouts")
  public ResponseEntity<?> start(Principal principal, @RequestBody PaymentRequest request) {
    var attempt =
        service.start(
            principal.getName(), request.requestKey(), request.cartVersion(), request.mode());
    if (attempt.loseResponse())
      return ResponseEntity.status(503)
          .body(
              Map.of(
                  "code",
                  "PAYMENT_RESPONSE_LOST",
                  "message",
                  "결제 응답을 받지 못했습니다. 같은 요청의 결과를 확인해 주세요."));
    return ResponseEntity.ok(attempt.checkout());
  }

  @Operation(
      summary = "본인 결제 요청 결과 조회",
      description = "서버 재기동·응답 유실 후에도 같은 영속 결과를 반환합니다. 없는 키·다른 구매자의 키는 404입니다.")
  @GetMapping("/checkouts/{key}")
  public CheckoutView result(Principal principal, @PathVariable String key) {
    return service.result(principal.getName(), key);
  }

  @Operation(
      summary = "본인 통합 결제·매장별 주문 내역",
      description = "최근 100개 요청을 최신순으로 조회하며 확정 주문은 구매 당시 상품·가격·수령 조건으로 표시합니다.")
  @GetMapping("/orders")
  public List<CheckoutView> orders(Principal principal) {
    return service.history(principal.getName());
  }

  @Operation(
      summary = "본인 확정 주문의 모의 결제 내역서",
      description =
          "본인의 CONFIRMED 주문만 조회합니다. 결제 확정 시각은 원본 UTC(confirmedAt), 총액은 결제 당시 저장값(totalWon)이며, storeOrders는 조회 시점의 상품 스냅샷·취소·완료 환불 상태를 일관된 읽기 스냅샷으로 제공합니다. 실제 청구·공식 세무 증빙이 아닌 모의 결제 테스트 내역이며 카드 승인번호·현금영수증 발급번호는 제공하지 않습니다. 없는 주문·타인 주문·미확정(PENDING/FAILED) 주문은 모두 같은 404입니다.")
  @ApiResponse(responseCode = "200", description = "원본 결제 시각·총액·매장별 주문과 모의 결제 테스트 안내")
  @ApiResponse(responseCode = "401", description = "미로그인·세션 만료")
  @ApiResponse(responseCode = "403", description = "구매자가 아닌 판매자·관리자")
  @ApiResponse(responseCode = "404", description = "없는 주문·타인의 주문·미확정 주문")
  @GetMapping("/orders/{checkoutId}/statement")
  public StatementView statement(Principal principal, @PathVariable long checkoutId) {
    return service.statement(principal.getName(), checkoutId);
  }
}
