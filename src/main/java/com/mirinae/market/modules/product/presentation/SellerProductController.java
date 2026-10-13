package com.mirinae.market.modules.product.presentation;

import com.mirinae.market.modules.product.business.OfferView;
import com.mirinae.market.modules.product.business.PickupWindowView;
import com.mirinae.market.modules.product.business.ProductPage;
import com.mirinae.market.modules.product.business.ProductService;
import com.mirinae.market.modules.product.business.ProductView;
import com.mirinae.market.modules.product.business.SaleChange;
import com.mirinae.market.modules.product.business.SaleProductPage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/seller/stores/{storeId}")
@SecurityRequirement(name = "sessionCookie")
@ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
@ApiResponse(responseCode = "403", description = "판매자 역할·매장 소유권·CSRF 실패: FORBIDDEN")
@ApiResponse(responseCode = "400", description = "잘못된 입력·날짜·시간·숫자: INVALID_INPUT")
@ApiResponse(responseCode = "404", description = "본인 매장에 상품 없음: NOT_FOUND")
public class SellerProductController {
  private final ProductService products;

  public SellerProductController(ProductService products) {
    this.products = products;
  }

  @Operation(
      summary = "본인 상품 등록",
      description = "자유 상품명과 숫자 판매 구성을 별도 저장합니다. 이 단계만으로 구매자에게 공개되지 않습니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "201", description = "상품 기본 정보 저장")
  @PostMapping("/products")
  @ResponseStatus(HttpStatus.CREATED)
  public ProductView create(
      Principal principal, @PathVariable long storeId, @RequestBody ProductRequest request) {
    return products.create(
        principal.getName(),
        storeId,
        request.name(),
        request.description(),
        request.unitType(),
        request.unitAmount());
  }

  @Operation(
      summary = "본인 상품 상세",
      description = "등록·수정 화면을 복원하는 본인 미삭제 상품 조회입니다. 매장 소유권은 서버 세션으로 검사합니다.")
  @ApiResponse(responseCode = "200", description = "본인 상품 기본 정보와 판매 이력 유무")
  @ApiResponse(responseCode = "404", description = "없는 상품 또는 삭제된 상품: NOT_FOUND")
  @GetMapping("/products/{productId}")
  public ProductView product(
      Principal principal, @PathVariable long storeId, @PathVariable long productId) {
    return products.product(principal.getName(), storeId, productId);
  }

  @Operation(summary = "본인 상품 수정", description = "판매 조건 생성 이후 상품명·판매 구성은 고정됩니다. 설명은 수정할 수 있습니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "수정된 상품")
  @ApiResponse(responseCode = "409", description = "공개 이력이 있는 상품의 이름·판매 구성 변경: PRODUCT_LOCKED")
  @PutMapping("/products/{productId}")
  public ProductView update(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable long productId,
      @RequestBody ProductRequest request) {
    return products.update(
        principal.getName(),
        storeId,
        productId,
        request.name(),
        request.description(),
        request.unitType(),
        request.unitAmount());
  }

  @Operation(
      summary = "본인 상품 목록",
      description =
          "날짜와 무관한 기본 정보. ID순 페이지, 기본 20건·최대 100건과 hasNext·totalItems와 판매 이력 hasSales를 제공합니다.")
  @ApiResponse(responseCode = "200", description = "본인 상품 목록")
  @GetMapping("/products")
  public ProductPage list(
      Principal principal,
      @PathVariable long storeId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return products.products(principal.getName(), storeId, page, size);
  }

  @Operation(
      summary = "본인 상품 삭제",
      description = "기록은 보존하고 판매자 목록과 공개 판매에서 제외합니다. 이미 삭제된 본인 상품의 재요청도 204입니다. 주문 취소와는 별개입니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "204", description = "상품 삭제 처리 완료")
  @DeleteMapping("/products/{productId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void archive(
      Principal principal, @PathVariable long storeId, @PathVariable long productId) {
    products.archive(principal.getName(), storeId, productId);
  }

  @Operation(
      summary = "매장 수령 시간 등록·수정",
      description = "한국 시간 기준 오늘만 허용합니다. 같은 매장·날짜의 모든 판매 조건이 시간을 공유합니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "수령 시간 저장")
  @PutMapping("/pickup-windows/{pickupDate}")
  public PickupWindowView window(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable LocalDate pickupDate,
      @RequestBody PickupWindowRequest request) {
    return products.window(
        principal.getName(),
        storeId,
        pickupDate,
        request.startTime(),
        request.endTime(),
        request.orderDeadline());
  }

  @Operation(
      summary = "매장 수령 시간 조회",
      description = "본인 매장의 오늘 수령 시간을 복원합니다. 미등록은 404 NOT_FOUND이며 타 매장 정보는 반환하지 않습니다.")
  @ApiResponse(responseCode = "200", description = "저장된 수령 시간")
  @GetMapping("/pickup-windows/{pickupDate}")
  public PickupWindowView window(
      Principal principal, @PathVariable long storeId, @PathVariable LocalDate pickupDate) {
    return products.window(principal.getName(), storeId, pickupDate);
  }

  @Operation(
      summary = "오늘 판매 조건 등록·수정",
      description =
          "한 상품·수령일에 하나. 저장 즉시 공개하며 재등록은 같은 제안 ID의 가격·온라인 수량을 수정합니다. 매장이 정한 주문 마감 정각부터 공개 조회와 판매 조건 변경을 거절합니다. 주문 연동은 Phase 4 범위입니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "공개된 판매 조건과 단위당 보조 가격")
  @ApiResponse(responseCode = "409", description = "매장 수령 시간 미등록: PICKUP_WINDOW_REQUIRED")
  @PutMapping("/products/{productId}/offers/{pickupDate}")
  public OfferView offer(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable long productId,
      @PathVariable LocalDate pickupDate,
      @RequestBody OfferRequest request) {
    return products.offer(
        principal.getName(),
        storeId,
        productId,
        pickupDate,
        request.priceWon(),
        request.onlineQuantity());
  }

  @Operation(
      summary = "본인 상품의 오늘 판매 상태 표",
      description = "미판매·중단·품절·마감 상품도 포함하며 삭제한 상품은 제외합니다. 기본 20건·최대 100건 ID순 페이지와 전체 건수를 반환합니다.")
  @ApiResponse(responseCode = "200", description = "상품 기본 정보와 오늘 판매 여부·가격·온라인 수량")
  @GetMapping("/sales/{pickupDate}")
  public SaleProductPage sales(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable LocalDate pickupDate,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return products.sales(principal.getName(), storeId, pickupDate, page, size);
  }

  @Operation(
      summary = "오늘 판매 조건과 공통 시간 일괄 적용",
      description =
          "공통 시간과 수정한 최대 100행을 모두 저장하거나 전부 미적용합니다. 미포함 상품은 유지합니다. 판매 체크 해제는 오늘 판매만 중단하며 이력을 보존합니다. 마감 이후 변경은 거절하고 기존 단건 API와 같은 매장 잠금을 사용합니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "204", description = "모든 변경 적용 완료")
  @ApiResponse(
      responseCode = "400",
      description =
          "행 오류: SALE_BATCH_INVALID, issues(productId,message). 공통 시간·날짜 오류: INVALID_INPUT. 전체 미적용")
  @PutMapping("/sales/{pickupDate}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void applySales(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable LocalDate pickupDate,
      @RequestBody SaleBatchRequest request) {
    products.applySales(
        principal.getName(),
        storeId,
        pickupDate,
        request.startTime(),
        request.endTime(),
        request.orderDeadline(),
        request.products() == null
            ? null
            : request.products().stream()
                .map(
                    row ->
                        row == null
                            ? null
                            : new SaleChange(
                                row.productId(),
                                row.selling(),
                                row.priceWon(),
                                row.onlineQuantity()))
                .toList());
  }
}
