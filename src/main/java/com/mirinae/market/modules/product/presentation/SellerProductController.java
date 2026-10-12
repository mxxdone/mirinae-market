package com.mirinae.market.modules.product.presentation;

import com.mirinae.market.modules.product.business.OfferView;
import com.mirinae.market.modules.product.business.PickupWindowView;
import com.mirinae.market.modules.product.business.ProductPage;
import com.mirinae.market.modules.product.business.ProductService;
import com.mirinae.market.modules.product.business.ProductView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.security.Principal;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
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
      description = "날짜와 무관한 기본 정보. ID순 페이지, 기본 20건·최대 100건과 hasNext를 제공합니다.")
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
      summary = "매장 수령 시간 등록·수정",
      description = "한국 시간 기준 내일만 허용합니다. 같은 매장·날짜의 모든 판매 조건이 시간을 공유합니다.")
  @SecurityRequirement(name = "csrfToken")
  @ApiResponse(responseCode = "200", description = "수령 시간 저장")
  @PutMapping("/pickup-windows/{pickupDate}")
  public PickupWindowView window(
      Principal principal,
      @PathVariable long storeId,
      @PathVariable LocalDate pickupDate,
      @RequestBody PickupWindowRequest request) {
    return products.window(
        principal.getName(), storeId, pickupDate, request.startTime(), request.endTime());
  }

  @Operation(
      summary = "매장 수령 시간 조회",
      description = "본인 매장의 내일 수령 시간을 복원합니다. 미등록은 404 NOT_FOUND이며 타 매장 정보는 반환하지 않습니다.")
  @ApiResponse(responseCode = "200", description = "저장된 수령 시간")
  @GetMapping("/pickup-windows/{pickupDate}")
  public PickupWindowView window(
      Principal principal, @PathVariable long storeId, @PathVariable LocalDate pickupDate) {
    return products.window(principal.getName(), storeId, pickupDate);
  }

  @Operation(
      summary = "내일 판매 조건 등록·수정",
      description =
          "한 상품·수령일에 하나. 저장 즉시 공개하며 재등록은 같은 제안 ID의 가격·온라인 수량을 수정합니다. 00시부터 해당 날짜 수정은 거절됩니다. 주문 연동은 Phase 4 범위입니다.")
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
}
