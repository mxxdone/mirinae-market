package com.mirinae.market.modules.admin.presentation;

import com.mirinae.market.modules.admin.business.AdminMarketCandidateView;
import com.mirinae.market.modules.admin.business.AdminMarketInput;
import com.mirinae.market.modules.admin.business.AdminMarketView;
import com.mirinae.market.modules.admin.business.AdminMemberView;
import com.mirinae.market.modules.admin.business.AdminStoreView;
import com.mirinae.market.modules.admin.business.AdministratorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin")
@io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "401", description = "미로그인·세션 만료")
@ApiResponse(responseCode = "403", description = "관리자 권한 없음 또는 CSRF 오류")
@ApiResponse(responseCode = "400", description = "입력·조회 조건 오류, 전체 미적용")
@ApiResponse(responseCode = "409", description = "중복 이름·ID·이메일, 전체 미적용")
public class AdministratorController {
  private final AdministratorService service;

  public AdministratorController(AdministratorService service) {
    this.service = service;
  }

  @Operation(summary = "시장 목록 조회")
  @GetMapping("/markets")
  public List<AdminMarketView> markets(Principal actor) {
    return service.markets(actor.getName());
  }

  @Operation(
      summary = "시장 등록 후보 검색",
      description =
          "공공자료 최초 스냅샷의 지역·이름 검색입니다. provinceCode(시도)·regionCode(시군구)는 선택 조건이며 지역만으로 조회할 수 있습니다. 필터를 적용한 뒤 50건과 다음 페이지 확인용 1건을 반환합니다. 지역 미확인 후보는 지역 조건 없이 시장명으로 검색해 보완합니다.")
  @GetMapping("/market-candidates")
  public List<AdminMarketCandidateView> candidates(
      Principal actor,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(required = false) String provinceCode,
      @RequestParam(required = false) String regionCode) {
    return service.candidates(actor.getName(), query, page, provinceCode, regionCode);
  }

  @Operation(
      summary = "시장 등록",
      description =
          "이름·지역 코드·대표 주소·위도·경도가 필수입니다. 같은 시군구의 같은 이름은 409입니다. 시장과 이력을 함께 저장하며 외부 지도 호출에 의존하지 않습니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PostMapping("/markets")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  public AdminMarketView market(Principal actor, @RequestBody MarketInput input) {
    return service.createMarket(actor.getName(), input.value());
  }

  @Operation(
      summary = "시장 이름·위치 수정",
      description =
          "대표 주소와 지도 표시 좌표는 독립적입니다. 위치를 변경하려면 regionCode·address·latitude·longitude를 모두 입력합니다. 위치 필드를 모두 생략하면 기존 위치를 보존합니다. 기존 위치 미등록 시장도 이름만 수정할 수 있습니다. 시장 ID·소속 매장·기존 주문 스냅샷은 보존하고 전후 정보를 이력과 함께 저장합니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PutMapping("/markets/{id}")
  public AdminMarketView market(
      Principal actor, @PathVariable long id, @RequestBody MarketInput input) {
    return service.updateMarket(actor.getName(), id, input.value());
  }

  @Operation(
      summary = "매장 검색",
      description = "매장·시장 이름 또는 판매자 ID 검색. page는 0부터, 50건과 다음 페이지 확인용 1건을 반환합니다.")
  @GetMapping("/stores")
  public List<Map<String, Object>> stores(
      Principal actor,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page) {
    return service.stores(actor.getName(), query, page);
  }

  @Operation(
      summary = "매장과 새 판매자 동시 등록",
      description =
          "담당자 이름·국내 연락처는 필수입니다. 계정·매장·연결·이력을 모두 저장하거나 모두 미적용합니다. 첫 비밀번호는 별도 전달하고 첫 로그인 후 변경해야 합니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PostMapping("/stores")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  public AdminStoreView register(Principal actor, @RequestBody Registration input) {
    return service.register(
        actor.getName(),
        input.marketId(),
        input.name(),
        input.loginId(),
        input.password(),
        input.email(),
        input.contactName(),
        input.contactPhone());
  }

  @Operation(summary = "매장 이름 수정", description = "시장 이동·소유자 변경은 제공하지 않습니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PutMapping("/stores/{id}")
  public AdminStoreView store(
      Principal actor, @PathVariable long id, @RequestBody NameInput input) {
    return service.renameStore(actor.getName(), id, input.name());
  }

  @Operation(
      summary = "회원 검색",
      description =
          "role은 BUYER 또는 SELLER. ID·계정 이름·담당자·이메일로 검색하며 page당 50건과 다음 페이지 확인용 1건을 반환합니다.")
  @GetMapping("/members")
  public List<AdminMemberView> members(
      Principal actor,
      @RequestParam String role,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page) {
    return service.members(actor.getName(), role, query, page);
  }

  @Operation(summary = "판매자 담당자 정보 수정", description = "이메일 정규화·중복 검사를 적용하며 정보와 이력을 함께 저장합니다.")
  @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "csrfToken")
  @PutMapping("/sellers/{id}/contact")
  public AdminMemberView contact(
      Principal actor, @PathVariable long id, @RequestBody ContactInput input) {
    return service.contact(
        actor.getName(), id, input.contactName(), input.contactPhone(), input.email());
  }

  @Operation(
      summary = "날짜별 판매 현황 검색",
      description = "날짜 생략 시 오늘. 중단·삭제 상품의 판매 기록도 포함합니다. page당 50건과 다음 페이지 확인용 1건을 반환합니다.")
  @GetMapping("/sales")
  public List<Map<String, Object>> sales(
      Principal actor,
      @RequestParam(required = false) LocalDate date,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page) {
    return service.sales(actor.getName(), date, query, page);
  }

  @Operation(
      summary = "확정 주문 검색",
      description = "구매자 ID·계정 이름·매장 이름·주문 번호 검색. 실패·처리 중 요청 제외. page당 50건과 다음 페이지 확인용 1건을 반환합니다.")
  @GetMapping("/orders")
  public List<Map<String, Object>> orders(
      Principal actor,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page) {
    return service.orders(actor.getName(), query, page);
  }

  @Operation(
      summary = "확정 주문 상품·매장·수령 조건 조회",
      description = "주문 당시 저장한 조건을 반환하며 미확정·없는 주문은 빈 목록입니다.")
  @GetMapping("/orders/{id}/items")
  public List<Map<String, Object>> items(Principal actor, @PathVariable long id) {
    return service.orderItems(actor.getName(), id);
  }

  @Operation(
      summary = "관리자 변경 이력 검색",
      description =
          "type은 MARKET·STORE·SELLER 또는 생략. targetId로 대상 번호를 지정할 수 있습니다. from·until은 한국 날짜로 양 끝 날짜를 포함합니다. page당 50건과 다음 페이지 확인용 1건을 반환합니다. 인증 정보는 기록하지 않습니다.")
  @GetMapping("/changes")
  public List<Map<String, Object>> changes(
      Principal actor,
      @RequestParam(defaultValue = "") String type,
      @RequestParam(required = false) Long targetId,
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate until,
      @RequestParam(defaultValue = "0") int page) {
    return service.history(actor.getName(), type, targetId, from, until, page);
  }

  public record NameInput(String name) {}

  public record MarketInput(
      String name, String regionCode, String address, Double latitude, Double longitude) {
    AdminMarketInput value() {
      return new AdminMarketInput(name, regionCode, address, latitude, longitude);
    }
  }

  public record ContactInput(String contactName, String contactPhone, String email) {}

  public record Registration(
      long marketId,
      String name,
      String loginId,
      String password,
      String email,
      String contactName,
      String contactPhone) {}
}
