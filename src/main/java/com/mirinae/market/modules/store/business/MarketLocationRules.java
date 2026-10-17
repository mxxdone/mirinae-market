package com.mirinae.market.modules.store.business;

final class MarketLocationRules {
  private static final double EARTH_RADIUS_KM = 6371.0088;

  private MarketLocationRules() {}

  static String address(String value) {
    if (value == null
        || value.isBlank()
        || value.strip().length() > 500
        || value.chars().anyMatch(Character::isISOControl)) {
      throw new IllegalArgumentException("대표 주소는 1~500자로 입력해 주세요.");
    }
    return value.strip();
  }

  static String region(String value) {
    if (value == null || !value.matches("[0-9]{5}")) {
      throw new IllegalArgumentException("시도와 시군구를 선택해 주세요.");
    }
    return value;
  }

  static void coordinates(Double latitude, Double longitude) {
    if (latitude == null
        || longitude == null
        || !Double.isFinite(latitude)
        || !Double.isFinite(longitude)
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180) {
      throw new IllegalArgumentException("유효한 대표 위치의 위도·경도가 필요합니다.");
    }
  }

  static double distance(
      double latitude, double longitude, double targetLatitude, double targetLongitude) {
    double lat = Math.toRadians(targetLatitude - latitude);
    double lon = Math.toRadians(targetLongitude - longitude);
    double a =
        Math.pow(Math.sin(lat / 2), 2)
            + Math.cos(Math.toRadians(latitude))
                * Math.cos(Math.toRadians(targetLatitude))
                * Math.pow(Math.sin(lon / 2), 2);
    return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  }

  static boolean nearby(
      double latitude, double longitude, double targetLatitude, double targetLongitude) {
    return distance(latitude, longitude, targetLatitude, targetLongitude) <= 10.0 + 1e-9;
  }
}
