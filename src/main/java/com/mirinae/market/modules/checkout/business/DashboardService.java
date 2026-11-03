package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.checkout.data.DailyRow;
import com.mirinae.market.modules.checkout.data.DashboardData;
import com.mirinae.market.modules.checkout.data.LifetimeRow;
import com.mirinae.market.modules.checkout.data.MonthlyRow;
import com.mirinae.market.modules.checkout.data.PreparationRow;
import com.mirinae.market.modules.store.business.StoreService;
import java.math.BigInteger;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** 판매자 본인 매장의 원본 주문·환불을 한 스냅샷과 한 기준 시각으로 집계한다. */
@Service
public class DashboardService {
  private final DashboardData data;
  private final StoreService stores;
  private final Clock clock;

  public DashboardService(DashboardData data, StoreService stores, Clock clock) {
    this.data = data;
    this.stores = stores;
    this.clock = clock;
  }

  /** 조회일 상태·준비 수량, 누적 지표, 선택 월 금액을 반환한다. 소유권 검사와 네 집계가 같은 반복 읽기 스냅샷을 사용하며 기준 시각은 한 번만 캡처한다. */
  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public SellerDashboardView dashboard(String actor, long store, String date, String month) {
    stores.ownedStore(actor, store);
    Instant asOf = clock.instant();
    LocalDate day = DashboardRules.date(date, asOf);
    YearMonth selected = DashboardRules.month(month, asOf);

    DailyRow daily = data.daily(store, day, asOf);
    List<SellerDashboardView.PreparationItem> items =
        data.preparation(store, day, asOf).stream().map(DashboardService::item).toList();
    LifetimeRow lifetime = data.lifetime(store);
    MonthlyRow monthly =
        data.monthly(store, DashboardRules.monthStart(selected), DashboardRules.monthEnd(selected));

    return new SellerDashboardView(
        asOf,
        day.toString(),
        selected.toString(),
        new SellerDashboardView.Daily(
            daily.totalOrders(),
            daily.waitingOrders(),
            daily.pickedUpOrders(),
            daily.noShowOrders(),
            daily.cancelledOrders(),
            daily.partiallyCancelledOrders()),
        items,
        new SellerDashboardView.Lifetime(
            lifetime.orderCount(),
            lifetime.buyerCount(),
            text(lifetime.paymentWon()),
            text(lifetime.refundWon()),
            text(net(lifetime.paymentWon(), lifetime.refundWon()))),
        new SellerDashboardView.Monthly(
            text(monthly.paymentWon()),
            text(monthly.refundWon()),
            text(net(monthly.paymentWon(), monthly.refundWon()))));
  }

  private static SellerDashboardView.PreparationItem item(PreparationRow row) {
    return new SellerDashboardView.PreparationItem(
        row.productId(), row.productName(), row.unitType(), row.unitAmount(), row.quantity());
  }

  private static BigInteger net(BigInteger payment, BigInteger refund) {
    return payment.subtract(refund);
  }

  private static String text(BigInteger value) {
    return value.toString();
  }
}
