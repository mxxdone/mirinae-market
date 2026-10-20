package com.mirinae.market.modules.checkout.data;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 판매자 대시보드 지표를 확정 매장 주문 원본에서 직접 집계한다. */
@Repository
public class DashboardData {
  private final JdbcTemplate jdbc;

  public DashboardData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** 수령일 하루의 상태별 건수를 DB에서 집계한다. 상태 우선순위는 전체 취소 → 수령 완료 → 수령 마감 전 대기 → 미수령이며 마감 정각부터 미수령이다. */
  public DailyRow daily(long store, LocalDate date, Instant asOf) {
    return jdbc.queryForObject(
        """
        WITH confirmed AS (
          SELECT s.id,s.pickup_date,s.end_time,s.picked_up_at
          FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id
          WHERE s.store_id=? AND c.status='CONFIRMED' AND s.pickup_date=?
        ), item_agg AS (
          SELECT i.store_order_id,
                 count(*) AS item_count,
                 count(*) FILTER (WHERE i.cancelled_at IS NULL) AS remaining_count
          FROM order_items i JOIN confirmed f ON f.id=i.store_order_id
          GROUP BY i.store_order_id
        ), classified AS (
          SELECT COALESCE(a.remaining_count,0) AS remaining_count,
                 COALESCE(a.item_count,0)>COALESCE(a.remaining_count,0) AS partially_cancelled,
                 CASE
                   WHEN COALESCE(a.remaining_count,0)=0 THEN 'CANCELLED'
                   WHEN f.picked_up_at IS NOT NULL THEN 'PICKED_UP'
                   WHEN ?::timestamptz < ((f.pickup_date+f.end_time) AT TIME ZONE 'Asia/Seoul') THEN 'WAITING'
                   ELSE 'NO_SHOW'
                 END AS status
          FROM confirmed f LEFT JOIN item_agg a ON a.store_order_id=f.id
        )
        SELECT count(*)::bigint AS total_orders,
               count(*) FILTER (WHERE status='WAITING')::bigint AS waiting_orders,
               count(*) FILTER (WHERE status='PICKED_UP')::bigint AS picked_up_orders,
               count(*) FILTER (WHERE status='NO_SHOW')::bigint AS no_show_orders,
               count(*) FILTER (WHERE status='CANCELLED')::bigint AS cancelled_orders,
               count(*) FILTER (WHERE partially_cancelled AND remaining_count>0)::bigint AS partially_cancelled_orders
        FROM classified
        """,
        (rs, n) ->
            new DailyRow(
                rs.getLong("total_orders"),
                rs.getLong("waiting_orders"),
                rs.getLong("picked_up_orders"),
                rs.getLong("no_show_orders"),
                rs.getLong("cancelled_orders"),
                rs.getLong("partially_cancelled_orders")),
        store,
        date,
        value(asOf));
  }

  /** 수령 마감 전 대기 주문의 미취소 항목을 상품 스냅샷과 상품 ID로 묶은 준비 수량이다. */
  public List<PreparationRow> preparation(long store, LocalDate date, Instant asOf) {
    return jdbc.query(
        """
        WITH confirmed AS (
          SELECT s.id,s.pickup_date,s.end_time,s.picked_up_at
          FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id
          WHERE s.store_id=? AND c.status='CONFIRMED' AND s.pickup_date=?
        ), item_agg AS (
          SELECT i.store_order_id,count(*) FILTER (WHERE i.cancelled_at IS NULL) AS remaining_count
          FROM order_items i JOIN confirmed f ON f.id=i.store_order_id
          GROUP BY i.store_order_id
        ), waiting AS (
          SELECT f.id FROM confirmed f JOIN item_agg a ON a.store_order_id=f.id
          WHERE a.remaining_count>0 AND f.picked_up_at IS NULL
            AND ?::timestamptz < ((f.pickup_date+f.end_time) AT TIME ZONE 'Asia/Seoul')
        )
        SELECT o.product_id,i.product_name,i.unit_type,i.unit_amount,SUM(i.quantity)::bigint AS quantity
        FROM order_items i JOIN waiting w ON w.id=i.store_order_id
        JOIN daily_offers o ON o.id=i.offer_id
        WHERE i.cancelled_at IS NULL
        GROUP BY o.product_id,i.product_name,i.unit_type,i.unit_amount
        ORDER BY i.product_name,o.product_id,i.unit_type,i.unit_amount
        """,
        (rs, n) ->
            new PreparationRow(
                rs.getLong("product_id"),
                rs.getString("product_name"),
                rs.getString("unit_type"),
                rs.getInt("unit_amount"),
                rs.getLong("quantity")),
        store,
        date,
        value(asOf));
  }

  /** 전체 취소를 제외한 누적 주문·구매자와 전체 취소를 포함한 결제·완료 환불 금액이다. */
  public LifetimeRow lifetime(long store) {
    return jdbc.queryForObject(
        """
        WITH confirmed AS (
          SELECT s.id,c.buyer_id
          FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id
          WHERE s.store_id=? AND c.status='CONFIRMED'
        ), item_agg AS (
          SELECT i.store_order_id,count(*) FILTER (WHERE i.cancelled_at IS NULL) AS remaining_count
          FROM order_items i JOIN confirmed f ON f.id=i.store_order_id
          GROUP BY i.store_order_id
        )
        SELECT
          (SELECT count(*) FROM confirmed f JOIN item_agg a ON a.store_order_id=f.id WHERE a.remaining_count>0)::bigint AS order_count,
          (SELECT count(DISTINCT f.buyer_id) FROM confirmed f JOIN item_agg a ON a.store_order_id=f.id WHERE a.remaining_count>0)::bigint AS buyer_count,
          (SELECT COALESCE(SUM(i.price_won::bigint*i.quantity),0) FROM order_items i JOIN confirmed f ON f.id=i.store_order_id) AS payment_won,
          (SELECT COALESCE(SUM(r.amount_won),0) FROM refunds r JOIN confirmed f ON f.id=r.store_order_id WHERE r.status='COMPLETED') AS refund_won
        """,
        (rs, n) ->
            new LifetimeRow(
                rs.getLong("order_count"),
                rs.getLong("buyer_count"),
                amount(rs.getBigDecimal("payment_won")),
                amount(rs.getBigDecimal("refund_won"))),
        store);
  }

  /** 원결제 확정 월에 귀속한 결제·완료 환불 금액이다. */
  public MonthlyRow monthly(long store, Instant from, Instant to) {
    return jdbc.queryForObject(
        """
        WITH monthly AS (
          SELECT s.id
          FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id
          WHERE s.store_id=? AND c.status='CONFIRMED' AND c.confirmed_at>=? AND c.confirmed_at<?
        )
        SELECT
          (SELECT COALESCE(SUM(i.price_won::bigint*i.quantity),0) FROM order_items i JOIN monthly m ON m.id=i.store_order_id) AS payment_won,
          (SELECT COALESCE(SUM(r.amount_won),0) FROM refunds r JOIN monthly m ON m.id=r.store_order_id WHERE r.status='COMPLETED') AS refund_won
        """,
        (rs, n) ->
            new MonthlyRow(
                amount(rs.getBigDecimal("payment_won")), amount(rs.getBigDecimal("refund_won"))),
        store,
        value(from),
        value(to));
  }

  private static OffsetDateTime value(Instant instant) {
    return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
  }

  private static BigInteger amount(BigDecimal value) {
    return value == null ? BigInteger.ZERO : value.toBigIntegerExact();
  }
}
