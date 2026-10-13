package com.mirinae.market.modules.product.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

class SaleBatchRulesTest {
  @Test
  void allowsSoldOutAndStoppingWithoutOverwritingPreviousPrice() {
    assertThatCode(
            () ->
                SaleBatchRules.validate(
                    List.of(
                        new SaleChange(1L, true, 1000, 0), new SaleChange(2L, false, null, null))))
        .doesNotThrowAnyException();
    assertThatCode(() -> SaleBatchRules.validate(List.of())).doesNotThrowAnyException();
  }

  @Test
  void reportsAllInvalidRowsAndDuplicates() {
    assertThatThrownBy(
            () ->
                SaleBatchRules.validate(
                    List.of(
                        new SaleChange(1L, true, 0, 1),
                        new SaleChange(2L, true, 1000, -1),
                        new SaleChange(2L, false, null, null),
                        new SaleChange(null, null, null, null))))
        .isInstanceOfSatisfying(
            SaleBatchException.class,
            failure -> {
              assertThat(failure.issues()).hasSize(4);
              assertThat(failure.issues().get(0).productId()).isEqualTo(1L);
            });
  }

  @Test
  void limitsBatchAndRejectsMissingList() {
    assertThatCode(
            () ->
                SaleBatchRules.validate(
                    LongStream.rangeClosed(1, 100)
                        .mapToObj(id -> new SaleChange(id, false, null, null))
                        .toList()))
        .doesNotThrowAnyException();
    assertThatThrownBy(
            () ->
                SaleBatchRules.validate(
                    LongStream.rangeClosed(1, 101)
                        .mapToObj(id -> new SaleChange(id, false, null, null))
                        .toList()))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> SaleBatchRules.validate(null))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
