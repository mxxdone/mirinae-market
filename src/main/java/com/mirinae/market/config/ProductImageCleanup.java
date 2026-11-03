package com.mirinae.market.config;

import com.mirinae.market.modules.product.business.ProductImageService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ProductImageCleanup {
  private static final org.slf4j.Logger LOGGER =
      org.slf4j.LoggerFactory.getLogger(ProductImageCleanup.class);
  private final ProductImageService images;

  public ProductImageCleanup(ProductImageService images) {
    this.images = images;
  }

  @Scheduled(
      fixedDelayString = "${product.images.cleanup-delay-ms:3600000}",
      initialDelayString = "${product.images.cleanup-initial-delay-ms:60000}")
  public void clean() {
    try {
      int removed = images.cleanUnused();
      if (removed > 0) LOGGER.info("미사용 상품 이미지 {}건 정리", removed);
    } catch (java.io.UncheckedIOException failure) {
      LOGGER.error("상품 이미지 정리 실패. 다음 실행에서 재시도합니다.", failure);
    }
  }
}
