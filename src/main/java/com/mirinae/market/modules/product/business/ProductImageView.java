package com.mirinae.market.modules.product.business;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record ProductImageView(
    @Schema(description = "업로드마다 새로 발급하는 사진 식별자") String id,
    @Schema(description = "실제 픽셀 크기와 JPEG 공개 URL. 원본보다 확대하지 않음") List<Variant> variants) {
  public record Variant(int edge, int width, int height, String url) {}
}
