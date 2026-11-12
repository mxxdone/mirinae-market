package com.mirinae.market.modules.store.presentation;

import com.mirinae.market.modules.store.business.StorePage;
import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.modules.store.business.StoreView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/markets/{marketId}/stores")
@SecurityRequirement(name = "bearerAuth")
@ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
public class MarketStoreController {
  private final StoreService stores;

  public MarketStoreController(StoreService stores) {
    this.stores = stores;
  }

  @GetMapping
  @Operation(
      summary = "시장별 매장명 검색",
      description =
          "운영 중이며 판매자와 연결된 매장을 ID순으로 조회합니다. 오늘 판매 상품이 없어도 포함합니다. 이름 부분 검색, %, _는 일반 문자, 기본 20·최대 100건입니다. 담당자·계정 정보는 공개하지 않습니다.")
  @ApiResponse(responseCode = "200", description = "공개 매장과 페이지·전체 건수, 일치 없으면 빈 목록")
  @ApiResponse(responseCode = "400", description = "검색어·페이지 오류: INVALID_INPUT")
  public StorePage list(
      @PathVariable long marketId,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return stores.publicStores(marketId, query, page, size);
  }

  @GetMapping("/{storeId}")
  @Operation(summary = "시장 내 공개 매장 상세", description = "매장 ID·시장 ID·매장 이름만 반환합니다.")
  @ApiResponse(responseCode = "200", description = "공개 매장 기본 정보")
  @ApiResponse(responseCode = "404", description = "운영 중지·타 시장·판매자 연결 없음·매장 없음: NOT_FOUND")
  public StoreView detail(@PathVariable long marketId, @PathVariable long storeId) {
    return stores.publicStore(marketId, storeId);
  }
}
