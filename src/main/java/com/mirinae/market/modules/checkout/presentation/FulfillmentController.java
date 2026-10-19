package com.mirinae.market.modules.checkout.presentation;

import com.mirinae.market.modules.checkout.business.FulfillmentService;
import com.mirinae.market.modules.checkout.business.StoreOrderPage;
import com.mirinae.market.modules.checkout.business.StoreOrderView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "400", description = "입력 형식·항목 선택 오류. 전체 미적용")
@ApiResponse(responseCode = "401", description = "미로그인·세션 만료")
@ApiResponse(responseCode = "403", description = "역할·소유 매장·CSRF 권한 오류")
@ApiResponse(responseCode = "404", description = "없거나 본인에게 속하지 않는 주문")
@ApiResponse(responseCode = "409", description = "취소·판매 실패·수령 시간/상태 또는 요청 키 충돌")
public class FulfillmentController {
  private final FulfillmentService service;

  public FulfillmentController(FulfillmentService service) {
    this.service = service;
  }

  public record CancellationInput(String requestKey, String kind) {}

  public record FailureInput(String requestKey, List<Long> itemIds, String reason) {}

  public record PickupInput(String code) {}

  @Operation(
      summary = "본인 매장 주문 상세",
      description = "구매 당시 조건·수령 코드·취소 가능 여부·상품별 취소·환불 진행 상태입니다. 미수령만으로 자동 환불하지 않습니다.")
  @GetMapping("/api/buyer/store-orders/{id}")
  public StoreOrderView buyer(Principal actor, @PathVariable long id) {
    return service.buyerOrder(actor.getName(), id);
  }

  @Operation(
      summary = "매장 주문 전체 또는 판매 실패 후 나머지 취소",
      description =
          "kind는 GENERAL 또는 REMAINDER입니다. requestKey는 영문·숫자·밑줄·하이픈 1~100자이며 재시도에 같은 키를 유지합니다. 같은 키의 다른 내용은 409. 취소는 확정하고 환불 진행은 별도로 조회합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/buyer/store-orders/{id}/cancellations")
  public StoreOrderView cancel(
      Principal actor, @PathVariable long id, @RequestBody CancellationInput input) {
    return service.cancel(actor.getName(), id, input.requestKey(), input.kind());
  }

  @Operation(
      summary = "본인 매장 날짜별 주문·준비 상품 조회",
      description =
          "date 미지정 시 한국 시간 오늘. page는 0부터 시작하며 items 최대 50개와 hasNext를 반환합니다. 판매자에게 수령 코드는 노출하지 않습니다.")
  @GetMapping("/api/seller/stores/{storeId}/orders")
  public StoreOrderPage orders(
      Principal actor,
      @PathVariable long storeId,
      @RequestParam(required = false) LocalDate date,
      @RequestParam(defaultValue = "0") int page) {
    return service.sellerOrders(actor.getName(), storeId, date, page);
  }

  @Operation(summary = "본인 매장 주문 상세")
  @GetMapping("/api/seller/stores/{storeId}/orders/{id}")
  public StoreOrderView seller(Principal actor, @PathVariable long storeId, @PathVariable long id) {
    return service.sellerOrder(actor.getName(), storeId, id);
  }

  @Operation(
      summary = "수령 코드로 유효 상품 일괄 수령",
      description = "숫자 6자리 code를 검사합니다. 주문의 수령 시작 이상·마감 미만에서만 허용하며 같은 올바른 코드의 완료 재요청은 기존 결과입니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/seller/stores/{storeId}/orders/{id}/pickup")
  public StoreOrderView pickup(
      Principal actor,
      @PathVariable long storeId,
      @PathVariable long id,
      @RequestBody PickupInput input) {
    return service.pickup(actor.getName(), storeId, id, input.code());
  }

  @Operation(
      summary = "선택 상품 판매 실패·취소·모의 환불",
      description =
          "requestKey·중복 없는 itemIds·1~500자 reason이 필수입니다. 선택 상품의 구매 수량 전체를 취소하며 재고는 복원하지 않습니다. 수령일 당일 자정 전, 수령 완료 이전에만 가능합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/api/seller/stores/{storeId}/orders/{id}/failures")
  public StoreOrderView failure(
      Principal actor,
      @PathVariable long storeId,
      @PathVariable long id,
      @RequestBody FailureInput input) {
    return service.failure(
        actor.getName(), storeId, id, input.requestKey(), input.itemIds(), input.reason());
  }
}
