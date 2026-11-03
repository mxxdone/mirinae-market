package com.mirinae.market.modules.product.presentation;

import com.mirinae.market.modules.product.business.ProductImageService;
import com.mirinae.market.modules.product.business.ProductImageView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.io.IOException;
import java.security.Principal;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@ApiResponse(responseCode = "400", description = "사진 형식·픽셀·ID 입력 오류: INVALID_INPUT")
@ApiResponse(responseCode = "401", description = "관리/목록 API 로그인 필요: UNAUTHENTICATED")
@ApiResponse(responseCode = "403", description = "판매자 역할·본인 매장·CSRF 오류: FORBIDDEN")
@ApiResponse(responseCode = "404", description = "상품 또는 이미지 없음: NOT_FOUND")
@ApiResponse(responseCode = "409", description = "처리 중 또는 연결 불가: IMAGE_BUSY/IMAGE_UNAVAILABLE")
@ApiResponse(responseCode = "413", description = "업로드 파일 또는 요청 크기 초과: IMAGE_TOO_LARGE")
public class ProductImageController {
  private final ProductImageService images;

  public ProductImageController(ProductImageService images) {
    this.images = images;
  }

  @PostMapping(
      value = "/api/seller/stores/{storeId}/product-images",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @SecurityRequirement(name = "sessionCookie")
  @SecurityRequirement(name = "csrfToken")
  @Operation(
      summary = "상품 사진 임시 업로드",
      description =
          "본인 매장에 JPG/PNG 1장, 최대5MiB·25MP·한 변10000px. 최소 크기 제한 없음. 256/768/1600px 이하 JPEG로 변환하고 방향·비율을 유지하며 확대하지 않습니다. 반환 ID는24시간 안에 상품 저장의 imageId로 연결합니다.")
  public ProductImageView upload(
      Principal actor, @PathVariable long storeId, @RequestParam MultipartFile file)
      throws IOException {
    return images.upload(actor.getName(), storeId, file.getBytes());
  }

  public record ImageResponse(ProductImageView image) {}

  @GetMapping("/api/seller/stores/{storeId}/products/{productId}/image")
  @SecurityRequirement(name = "sessionCookie")
  @Operation(
      summary = "본인 상품의 대표 사진",
      description = "image 필드가 미등록이면 null, 등록돼 있으면 ID와 버전별 실제 치수·URL입니다.")
  public ImageResponse current(
      Principal actor, @PathVariable long storeId, @PathVariable long productId) {
    return new ImageResponse(images.current(actor.getName(), storeId, productId));
  }

  @GetMapping("/api/markets/{marketId}/product-images")
  @SecurityRequirement(name = "sessionCookie")
  @Operation(
      summary = "시장 상품 사진 일괄 조회",
      description =
          "productIds 양수1~100개. 선택 시장의 운영 매장·미삭제 상품 중 사진이 연결된 상품만 반환합니다. 다른 시장·비공개·사진 없는 상품은 결과에서 제외합니다. 판매 조건/가격은 기존 상품 API가 기준입니다.")
  public List<ProductImageService.PublicImage> list(
      @PathVariable long marketId, @RequestParam List<Long> productIds) {
    return images.publicImages(marketId, productIds);
  }

  @GetMapping(value = "/media/products/{imageId}/{edge}.jpg", produces = MediaType.IMAGE_JPEG_VALUE)
  @Operation(
      summary = "최적화된 상품 사진 파일",
      description =
          "사진 파일은 로그인 없이 조회할 수 있습니다. 생성된 UUID와256/768/1600 버전만 허용하며 사용자 파일명·위치 메타데이터는 공개하지 않습니다. 교체·삭제 후 유예 동안 이전 URL이 남을 수 있습니다.")
  public ResponseEntity<byte[]> content(@PathVariable String imageId, @PathVariable int edge) {
    return ResponseEntity.ok()
        .header("Cache-Control", "public, max-age=86400, immutable")
        .contentType(MediaType.IMAGE_JPEG)
        .body(images.content(imageId, edge));
  }
}
