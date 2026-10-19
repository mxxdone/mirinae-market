package com.mirinae.market.modules.checkout.business;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.data.CheckoutData;
import com.mirinae.market.modules.checkout.data.CheckoutRow;
import com.mirinae.market.modules.checkout.data.LineRow;
import com.mirinae.market.modules.product.business.InventoryOffer;
import com.mirinae.market.modules.product.business.InventoryService;
import com.mirinae.market.modules.product.business.OfferView;
import com.mirinae.market.modules.store.business.StoreService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class CheckoutCodeCapacityTest {
  @Test
  void oneStoresExhaustedCodeSpaceFailsWholeCheckoutBeforeInventoryPurchase() {
    var data = mock(CheckoutData.class);
    var inventory = mock(InventoryService.class);
    var fulfillment = mock(FulfillmentService.class);
    var clock = Clock.fixed(Instant.parse("2026-10-13T03:00:00Z"), ZoneOffset.UTC);
    var date = LocalDate.parse("2026-10-13");
    var start = LocalTime.of(14, 0);
    var end = LocalTime.of(18, 0);
    var deadline = LocalTime.of(13, 0);
    var pending =
        new CheckoutRow(7, 9, "capacity", 0, "SUCCESS", "PENDING", null, null, 0, clock.instant());
    var failed =
        new CheckoutRow(
            7,
            9,
            "capacity",
            0,
            "SUCCESS",
            "FAILED",
            "PICKUP_CODE_EXHAUSTED",
            "코드 공간 소진",
            0,
            clock.instant());
    when(data.find(9, "capacity")).thenReturn(Optional.of(pending)).thenReturn(Optional.of(failed));
    when(data.items(7))
        .thenReturn(
            List.of(
                new LineRow(1, 1, 1000, start, end, deadline),
                new LineRow(2, 1, 1000, start, end, deadline)));
    for (long id = 1; id <= 2; id++) {
      var offer =
          new OfferView(
              id,
              id,
              1,
              id,
              "매장",
              "사과",
              "",
              "COUNT",
              1,
              date,
              1000,
              10,
              0,
              start,
              end,
              deadline,
              "1개",
              BigDecimal.valueOf(1000));
      when(inventory.describe(id)).thenReturn(new InventoryOffer(offer, true));
    }
    when(data.freePickupCode(1, date)).thenReturn(Optional.of("123456"));
    when(data.freePickupCode(2, date)).thenReturn(Optional.empty());
    var service =
        new CheckoutTransactions(
            data,
            inventory,
            mock(AccountService.class),
            clock,
            fulfillment,
            mock(StoreService.class));
    assertThat(service.finish(9, "capacity").status()).isEqualTo("FAILED");
    verify(inventory, never()).purchase(anyList());
    verify(data).failed(eq(7L), eq("PICKUP_CODE_EXHAUSTED"), anyString());
    verify(data).advance(9);
  }
}
