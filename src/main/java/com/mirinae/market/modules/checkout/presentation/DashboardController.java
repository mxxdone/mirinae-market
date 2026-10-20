package com.mirinae.market.modules.checkout.presentation;

import com.mirinae.market.modules.checkout.business.DashboardService;
import com.mirinae.market.modules.checkout.business.SellerDashboardView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "400", description = "날짜·월 형식 오류. YYYY-MM-DD·YYYY-MM만 허용")
@ApiResponse(responseCode = "401", description = "미로그인·세션 만료")
@ApiResponse(responseCode = "403", description = "판매자 역할·본인 매장 소유권 오류")
public class DashboardController {
  private final DashboardService service;

  public DashboardController(DashboardService service) {
    this.service = service;
  }

  @Operation(
      summary = "본인 매장 판매자 대시보드 조회",
      description =
          "date 미지정 시 한국 시간 오늘, month 미지정 시 이번 달입니다. 수령일 상태·준비 수량, 전체 취소 제외 누적 주문·구매자, 전체 취소를 포함한 결제 금액과 완료 환불 금액을 원본에서 조회합니다. 월별 금액은 한국 시간 결제 확정 월에 귀속하며 다음 달 완료된 환불도 원결제 월에 반영하므로 과거 월 결과가 바뀔 수 있습니다. 단일 조회의 모든 지표는 같은 DB 스냅샷과 asOf 기준 시각으로 계산하고, 조회 완료 후 변경은 재조회에서 반영합니다. 읽기만 수행하며 금액은 10진 문자열입니다.")
  @GetMapping("/api/seller/stores/{storeId}/dashboard")
  public SellerDashboardView dashboard(
      Principal actor,
      @PathVariable long storeId,
      @RequestParam(required = false) String date,
      @RequestParam(required = false) String month) {
    return service.dashboard(actor.getName(), storeId, date, month);
  }
}
