package com.mirinae.market.modules.product.presentation;

import com.mirinae.market.modules.product.business.OfferPage;
import com.mirinae.market.modules.product.business.OfferView;
import com.mirinae.market.modules.product.business.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/markets/{marketId}/offers")
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
public class OfferController {
  private final ProductService products;

  public OfferController(ProductService products) {
    this.products = products;
  }

  @Operation(
      summary = "시장별 오늘 판매 상품 검색",
      description =
          "상품명 부분 검색(영문 대소문자 무시). %, _는 일반 문자입니다. 기본 20건·최대 100건 ID순 페이지입니다. 자동 상품 묶기·가격 정렬은 제공하지 않습니다. 가격은 포장 가격과 표시용 100g당·1개당 가격을 구분합니다.")
  @ApiResponse(responseCode = "200", description = "해당 시장·오늘 수령 조건 목록과 hasNext")
  @ApiResponse(responseCode = "400", description = "검색어·페이지 입력 오류: INVALID_INPUT")
  @GetMapping
  public OfferPage search(
      @PathVariable long marketId,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return products.search(marketId, query, page, size);
  }

  @Operation(summary = "공개 상품 상세", description = "선택한 시장의 오늘 수령분만 반환합니다. 품절 수량 0도 표시합니다.")
  @ApiResponse(responseCode = "200", description = "상품·매장·판매 구성·포장 가격·보조 가격·수령 시간")
  @ApiResponse(responseCode = "404", description = "타 시장·기한 종료·없는 제안: NOT_FOUND")
  @GetMapping("/{offerId}")
  public OfferView detail(@PathVariable long marketId, @PathVariable long offerId) {
    return products.detail(marketId, offerId);
  }
}
