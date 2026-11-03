package com.mirinae.market.modules.store.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class MarketLocationRulesTest {
  @Test
  void requiresCompleteFiniteLocationAndNormalizesAddress() {
    assertThat(MarketLocationRules.address("  서울특별시 종로구 창경궁로 88  ")).isEqualTo("서울특별시 종로구 창경궁로 88");
    MarketLocationRules.coordinates(37.5, 127.0);
    for (Double latitude : new Double[] {null, Double.NaN, Double.POSITIVE_INFINITY, 90.1, -90.1}) {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> MarketLocationRules.coordinates(latitude, 127.0));
    }
    assertThatIllegalArgumentException()
        .isThrownBy(() -> MarketLocationRules.coordinates(37.5, null));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> MarketLocationRules.coordinates(37.5, 180.1));
    assertThatIllegalArgumentException().isThrownBy(() -> MarketLocationRules.address(" "));
    assertThatIllegalArgumentException().isThrownBy(() -> MarketLocationRules.address("서울\n주소"));
    assertThatIllegalArgumentException().isThrownBy(() -> MarketLocationRules.region("1111"));
    assertThat(MarketLocationRules.region("11110")).isEqualTo("11110");
  }

  @Test
  void measuresStraightLineDistanceAndIncludesTenKilometerBoundary() {
    assertThat(MarketLocationRules.distance(37.5, 127.0, 37.5, 127.0)).isZero();
    double boundaryLatitude = Math.toDegrees(10.0 / 6371.0088);
    assertThat(MarketLocationRules.nearby(0, 0, boundaryLatitude, 0)).isTrue();
    assertThat(MarketLocationRules.nearby(0, 0, boundaryLatitude + 0.00001, 0)).isFalse();
    assertThat(MarketLocationRules.nearby(0, 0, boundaryLatitude - 0.00001, 0)).isTrue();
    assertThat(MarketLocationRules.distance(0, 0, 0, 180)).isFinite();
  }
}
