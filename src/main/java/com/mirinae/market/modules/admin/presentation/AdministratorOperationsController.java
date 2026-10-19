package com.mirinae.market.modules.admin.presentation;

import com.mirinae.market.modules.admin.business.AdminManagedReportView;
import com.mirinae.market.modules.admin.business.AdminRefundView;
import com.mirinae.market.modules.admin.business.AdminStoreOrderView;
import com.mirinae.market.modules.admin.business.AdministratorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "401", description = "미로그인")
@ApiResponse(responseCode = "403", description = "관리자 권한·CSRF 오류")
@ApiResponse(responseCode = "400", description = "입력·사유 종류·길이 오류")
@ApiResponse(responseCode = "404", description = "주문·환불 없음")
@ApiResponse(responseCode = "409", description = "취소 상태·시간 또는 요청 키 충돌")
public class AdministratorOperationsController {
  private final AdministratorService service;

  public AdministratorOperationsController(AdministratorService service) {
    this.service = service;
  }

  public record CancellationInput(String requestKey, String reasonType, String reason) {}

  public record ReportStatusInput(String status, String resolution) {}

  public record OperationInput(Boolean suspended, String reason) {}

  @Operation(
      summary = "관리자 매장 주문 운영 상세",
      description = "통합 주문에 속한 매장별 상태·상품 취소·환불 내역을 반환하며 수령 코드는 노출하지 않습니다.")
  @GetMapping("/orders/{id}/store-orders")
  public List<AdminStoreOrderView> orders(Principal actor, @PathVariable long id) {
    return service.managedStoreOrders(actor.getName(), id);
  }

  @Operation(
      summary = "매장 제보 및 연락 확인 대상 조회",
      description =
          "status는 빈 값 또는 OPEN·REVIEWING·RESOLVED. 최근 50건과 다음 페이지 확인용 1건. 제보·담당자 연락처(누락 가능)·미완료 폐업 의심 구매자 수·3명 이상 needsContact를 제공합니다.")
  @GetMapping("/store-reports")
  public List<AdminManagedReportView> reports(
      Principal actor,
      @RequestParam(defaultValue = "") String status,
      @RequestParam(defaultValue = "0") int page) {
    return service.reports(actor.getName(), status, page);
  }

  @Operation(
      summary = "매장 제보 확인 중·처리 완료",
      description =
          "OPEN에서 REVIEWING 또는 RESOLVED, REVIEWING에서 RESOLVED로 변경합니다. 완료 시 resolution 1~500자가 필수이며 완료 건 재개는 불가합니다. 정보와 관리자 이력을 함께 저장합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PatchMapping("/store-reports/{id}")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void report(Principal actor, @PathVariable long id, @RequestBody ReportStatusInput input) {
    service.resolveReport(actor.getName(), id, input.status(), input.resolution());
  }

  @Operation(
      summary = "매장 운영 중지·해제",
      description =
          "suspended와 사유 reason 1~500자가 필수입니다. 신규 구매를 차단하고 기존 주문은 유지합니다. 같은 상태 재요청은 중복 이력을 만들지 않으며 제보 처리와 별개입니다.")
  @SecurityRequirement(name = "csrfToken")
  @PutMapping("/stores/{id}/operation")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void operation(Principal actor, @PathVariable long id, @RequestBody OperationInput input) {
    if (input.suspended() == null) throw new IllegalArgumentException("운영 중지 여부를 입력해 주세요.");
    service.operation(actor.getName(), id, input.suspended(), input.reason());
  }

  @Operation(
      summary = "관리자 대신 취소·모의 환불",
      description =
          "BUYER_REQUEST는 주문 마감 전, STORE_FAULT·SERVICE_ERROR는 마감 후 미수령에도 허용합니다. 수령 완료는 거절합니다. 1~500자 확인 사유와 requestKey가 필수이며 처리자·사유를 업무 변경과 함께 기록합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/store-orders/{id}/cancellations")
  public AdminStoreOrderView cancel(
      Principal actor, @PathVariable long id, @RequestBody CancellationInput input) {
    return service.cancelOrder(
        actor.getName(), id, input.requestKey(), input.reasonType(), input.reason());
  }

  @Operation(
      summary = "모의 환불 목록",
      description =
          "최신 순 50건과 다음 페이지 확인용 1건을 반환합니다. 금액은 10진수 문자열. PENDING·COMPLETED·NEEDS_ATTENTION을 구분합니다.")
  @GetMapping("/refunds")
  public List<AdminRefundView> refunds(
      Principal actor, @RequestParam(defaultValue = "0") int page) {
    return service.refunds(actor.getName(), page);
  }

  @Operation(
      summary = "관리자 확인 필요 환불 재처리",
      description = "모의 장애 해소를 재현하며 SUCCESS로 재처리합니다. 완료·처리 중 작업은 변경/재지급하지 않고 실제 변경만 이력에 기록합니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping("/refunds/{id}/retry")
  @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
  public void retry(Principal actor, @PathVariable long id) {
    service.retryRefund(actor.getName(), id);
  }
}
