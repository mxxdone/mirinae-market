package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ProductRulesTest {
  @Test
  void freeNamesKeepTheirSizeTextAndNormalizeOnlyOuterSpace() {
    assertThat(ProductRules.name("  국내산 양파 3kg  ")).isEqualTo("국내산 양파 3kg");
    assertThat(ProductRules.name("가".repeat(100))).hasSize(100);
    assertThat(ProductRules.description(null)).isEmpty();
    assertThat(ProductRules.description(" 설명 ")).isEqualTo("설명");
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.name("가".repeat(101)));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> ProductRules.description("가".repeat(1001)));
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"  ", "양파\n상품", "양파\u0000"})
  void rejectsEmptyOrControlCharactersInName(String value) {
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.name(value));
  }

  @Test
  void numericCompositionIsIndependentOfTheName() {
    assertThat(ProductRules.unit("WEIGHT", 3000).amount()).isEqualTo(3000);
    assertThat(ProductRules.unit("COUNT", 12).amount()).isEqualTo(12);
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.unit(null, 100));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.unit("kg", 100));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.unit("WEIGHT", null));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.unit("WEIGHT", 550));
  }

  @Test
  void comparisonUsesHundredGramsOrOneItemAndRoundsToTwoDecimals() {
    assertThat(ProductRules.comparisonPrice(10000, new SaleUnit(SaleUnit.Kind.WEIGHT, 1000)))
        .isEqualByComparingTo("1000.00");
    assertThat(ProductRules.comparisonPrice(1500, new SaleUnit(SaleUnit.Kind.WEIGHT, 100)))
        .isEqualByComparingTo("1500.00");
    assertThat(ProductRules.comparisonPrice(9000, new SaleUnit(SaleUnit.Kind.WEIGHT, 3000)))
        .isEqualByComparingTo("300.00");
    assertThat(ProductRules.comparisonPrice(1000, new SaleUnit(SaleUnit.Kind.COUNT, 12)))
        .isEqualByComparingTo(new BigDecimal("83.33"));
    assertThat(
            ProductRules.comparisonPrice(
                Integer.MAX_VALUE, new SaleUnit(SaleUnit.Kind.WEIGHT, 100)))
        .isEqualByComparingTo("2147483647.00");
  }

  @Test
  void positiveWonPriceAndNonNegativeOnlineQuantityHaveIntegerBoundaries() {
    assertThat(ProductRules.comparisonPrice(1, new SaleUnit(SaleUnit.Kind.COUNT, 8)))
        .isEqualByComparingTo("0.13");
    ProductRules.offer(1, 0);
    ProductRules.offer(Integer.MAX_VALUE, Integer.MAX_VALUE);
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.offer(0, 1));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.offer(-1, 1));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.offer(100, -1));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.offer(null, 1));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.offer(100, null));
  }

  @Test
  void searchesAreLiteralAndPagesAreBounded() {
    assertThat(ProductRules.query(null)).isEmpty();
    assertThat(ProductRules.query(" 양파%_ ")).isEqualTo("양파%_");
    ProductRules.page(0, 1);
    ProductRules.page(10000, 100);
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.query("x".repeat(101)));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.page(-1, 20));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.page(0, 0));
    assertThatIllegalArgumentException().isThrownBy(() -> ProductRules.page(0, 101));
    assertThatIllegalArgumentException()
        .isThrownBy(() -> ProductRules.page(Integer.MAX_VALUE, 100));
  }
}
