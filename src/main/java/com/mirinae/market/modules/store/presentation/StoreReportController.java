package com.mirinae.market.modules.store.presentation;

import com.mirinae.market.modules.store.business.StoreOperationService;
import com.mirinae.market.modules.store.business.StoreReportView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/buyer/stores/{storeId}/reports")
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "400", description = "제보 종류·내용 형식 오류")
@ApiResponse(responseCode = "401", description = "미로그인")
@ApiResponse(responseCode = "403", description = "구매자 권한·CSRF 오류")
public class StoreReportController {
  private final StoreOperationService service;

  public StoreReportController(StoreOperationService service) {
    this.service = service;
  }

  public record ReportInput(String type, String description) {}

  @Operation(
      summary = "매장 정보 제보",
      description =
          "구매 이력 없이 CLOSURE_SUSPECTED·INACTIVE·LOCATION_ERROR와 설명 1~500자로 제보합니다. 같은 구매자·매장·유형의 미완료 건이 있으면 기존 건을 반환합니다. 자동 운영 중지는 하지 않습니다.")
  @SecurityRequirement(name = "csrfToken")
  @PostMapping
  public StoreReportView report(
      Principal actor, @PathVariable long storeId, @RequestBody ReportInput input) {
    return service.report(actor.getName(), storeId, input.type(), input.description());
  }

  @Operation(
      summary = "본인의 해당 매장 제보 조회",
      description = "최근 100건을 반환하며 타 구매자 제보·신원·판매자 연락처를 노출하지 않습니다.")
  @GetMapping
  public List<StoreReportView> reports(Principal actor, @PathVariable long storeId) {
    return service.own(actor.getName(), storeId);
  }
}
