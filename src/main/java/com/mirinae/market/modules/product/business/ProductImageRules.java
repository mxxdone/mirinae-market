package com.mirinae.market.modules.product.business;

final class ProductImageRules {
  private ProductImageRules() {}

  static void validate(int width, int height, int bytes) {
    if (bytes < 1
        || bytes > 5 * 1024 * 1024
        || width < 1
        || height < 1
        || width > 10000
        || height > 10000
        || (long) width * height > 25000000) {
      throw new IllegalArgumentException("사진은 최대 5MiB·2,500만 픽셀·한 변 10,000px까지 등록할 수 있습니다.");
    }
  }

  static int[] scaled(int width, int height, int edge) {
    double factor = Math.min(1.0, (double) edge / Math.max(width, height));
    return new int[] {
      Math.max(1, (int) Math.round(width * factor)), Math.max(1, (int) Math.round(height * factor))
    };
  }

  static String key(String value) {
    if (value == null || !java.util.UUID.fromString(value).toString().equals(value))
      throw new IllegalArgumentException("잘못된 사진 ID입니다.");
    return value;
  }
}
