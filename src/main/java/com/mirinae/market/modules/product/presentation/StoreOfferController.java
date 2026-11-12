package com.mirinae.market.modules.product.presentation;

import com.mirinae.market.modules.product.business.OfferPage;
import com.mirinae.market.modules.product.business.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@SecurityRequirement(name = "bearerAuth")
@ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
public class StoreOfferController {
  private final ProductService products;

  public StoreOfferController(ProductService products) {
    this.products = products;
  }

  @GetMapping("/api/markets/{marketId}/stores/{storeId}/offers")
  @Operation(
      summary = "매장별 오늘 공개 상품 검색",
      description =
          "해당 매장의 상품명 부분 검색이며 기존 오늘 판매·마감·삭제·운영 기준을 적용합니다. 품절도 표시합니다. 매장 조건을 페이지와 전체 건수에 동일하게 적용합니다. 기본 20·최대 100건 ID순입니다.")
  @ApiResponse(responseCode = "200", description = "공개 상품과 페이지·전체 건수, 오늘 상품 없으면 빈 목록")
  @ApiResponse(responseCode = "400", description = "검색어·페이지 오류: INVALID_INPUT")
  @ApiResponse(responseCode = "404", description = "운영 중지·타 시장·판매자 연결 없음·매장 없음: NOT_FOUND")
  public OfferPage list(
      @PathVariable long marketId,
      @PathVariable long storeId,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return products.searchStore(marketId, storeId, query, page, size);
  }
}
