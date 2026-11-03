package com.mirinae.market.modules.checkout.data;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class FulfillmentData {
  private final JdbcTemplate jdbc;

  public FulfillmentData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<StoreOrderRow> order(long id) {
    return jdbc
        .query(
            "SELECT s.*,c.buyer_id FROM store_orders s JOIN checkouts c ON c.id=s.checkout_id WHERE s.id=? AND c.status='CONFIRMED'",
            (rs, n) ->
                new StoreOrderRow(
                    rs.getLong("id"),
                    rs.getLong("checkout_id"),
                    rs.getLong("buyer_id"),
                    rs.getLong("store_id"),
                    rs.getString("store_name"),
                    rs.getObject("pickup_date", LocalDate.class),
                    rs.getObject("start_time", LocalTime.class),
                    rs.getObject("end_time", LocalTime.class),
                    rs.getObject("order_deadline", LocalTime.class),
                    rs.getString("pickup_code"),
                    instant(rs.getTimestamp("picked_up_at"))),
            id)
        .stream()
        .findFirst();
  }

  public void lockOrder(long id) {
    jdbc.queryForObject("SELECT id FROM store_orders WHERE id=? FOR UPDATE", Long.class, id);
  }

  public List<Long> checkoutOrders(long checkoutId) {
    return jdbc.queryForList(
        "SELECT id FROM store_orders WHERE checkout_id=? ORDER BY id", Long.class, checkoutId);
  }

  public List<Long> sellerOrders(long store, LocalDate date, int page) {
    return jdbc.queryForList(
        "SELECT id FROM store_orders WHERE store_id=? AND pickup_date=? ORDER BY id DESC LIMIT 51 OFFSET ?",
        Long.class,
        store,
        date,
        page * 50);
  }

  public List<OrderItemRow> items(long order) {
    return jdbc.query(
        "SELECT * FROM order_items WHERE store_order_id=? ORDER BY id",
        (rs, n) ->
            new OrderItemRow(
                rs.getLong("id"),
                rs.getLong("offer_id"),
                rs.getString("product_name"),
                rs.getString("unit_type"),
                rs.getInt("unit_amount"),
                rs.getInt("price_won"),
                rs.getInt("quantity"),
                instant(rs.getTimestamp("cancelled_at")),
                rs.getString("cancellation_type"),
                rs.getString("cancellation_reason")),
        order);
  }

  public Optional<OperationRow> operation(long actor, String key) {
    return jdbc
        .query(
            "SELECT id,store_order_id,fingerprint FROM order_operations WHERE actor_id=? AND request_key=?",
            (rs, n) -> new OperationRow(rs.getLong(1), rs.getLong(2), rs.getString(3)),
            actor,
            key)
        .stream()
        .findFirst();
  }

  public long operation(long actor, String key, long order, String fingerprint, Instant now) {
    return jdbc.queryForObject(
        "INSERT INTO order_operations(actor_id,request_key,store_order_id,fingerprint,created_at) VALUES (?,?,?,?,?) RETURNING id",
        Long.class,
        actor,
        key,
        order,
        fingerprint,
        Timestamp.from(now));
  }

  public void cancel(long item, long actor, String type, String reason, Instant now) {
    jdbc.update(
        "UPDATE order_items SET cancelled_at=?,cancelled_by=?,cancellation_type=?,cancellation_reason=? WHERE id=? AND cancelled_at IS NULL",
        Timestamp.from(now),
        actor,
        type,
        reason,
        item);
  }

  public void pickup(long id, Instant now) {
    jdbc.update(
        "UPDATE store_orders SET picked_up_at=? WHERE id=? AND picked_up_at IS NULL",
        Timestamp.from(now),
        id);
  }

  public void refund(long operation, long order, long amount, String mode, Instant now) {
    jdbc.update(
        "INSERT INTO refunds(operation_id,store_order_id,amount_won,mode,due_at,created_at) VALUES (?,?,?,?,?,?)",
        operation,
        order,
        amount,
        mode,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  public List<RefundRow> refunds(long order) {
    return refundRows("SELECT * FROM refunds WHERE store_order_id=? ORDER BY id", order);
  }

  public List<RefundRow> managedRefunds(int page) {
    return refundRows("SELECT * FROM refunds ORDER BY id DESC LIMIT 51 OFFSET ?", page * 50);
  }

  public Optional<RefundRow> refund(long id, boolean lock) {
    // 별도 모의 제공자 트랜잭션의 외래 키 검증을 허용하되 작업 처리는 직렬화한다.
    return refundRows("SELECT * FROM refunds WHERE id=?" + (lock ? " FOR NO KEY UPDATE" : ""), id)
        .stream()
        .findFirst();
  }

  public List<Long> due(Instant now) {
    return jdbc.queryForList(
        "SELECT id FROM refunds WHERE status='PENDING' AND due_at<=? ORDER BY due_at,id LIMIT 100",
        Long.class,
        Timestamp.from(now));
  }

  public void claim(long id, String token, Instant leaseUntil) {
    jdbc.update(
        "UPDATE refunds SET attempts=attempts+1,attempt_token=?,due_at=? WHERE id=?",
        token,
        Timestamp.from(leaseUntil),
        id);
  }

  public boolean matchesAttempt(long id, String token) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT attempt_token=? FROM refunds WHERE id=?", Boolean.class, token, id));
  }

  public void defer(long id, Instant due) {
    jdbc.update("UPDATE refunds SET due_at=? WHERE id=?", Timestamp.from(due), id);
  }

  public void failed(long id, String error, boolean terminal) {
    jdbc.update(
        "UPDATE refunds SET last_error=?,status=? WHERE id=?",
        error,
        terminal ? "NEEDS_ATTENTION" : "PENDING",
        id);
  }

  public void completed(long id, Instant now) {
    jdbc.update(
        "UPDATE refunds SET status='COMPLETED',completed_at=?,last_error=NULL WHERE id=?",
        Timestamp.from(now),
        id);
  }

  public void retry(long id, Instant now) {
    jdbc.update(
        "UPDATE refunds SET status='PENDING',mode='SUCCESS',attempts=0,attempt_token=NULL,last_error=NULL,due_at=? WHERE id=?",
        Timestamp.from(now),
        id);
  }

  public boolean providerCompleted(long id) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM mock_refund_results WHERE refund_id=?)",
            Boolean.class,
            id));
  }

  public void providerComplete(long id, long amount, Instant now) {
    jdbc.update(
        "INSERT INTO mock_refund_results(refund_id,amount_won,completed_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",
        id,
        amount,
        Timestamp.from(now));
  }

  private List<RefundRow> refundRows(String sql, Object... args) {
    return jdbc.query(
        sql,
        (rs, n) ->
            new RefundRow(
                rs.getLong("id"),
                rs.getLong("store_order_id"),
                rs.getLong("amount_won"),
                rs.getString("status"),
                rs.getString("mode"),
                rs.getInt("attempts"),
                rs.getString("last_error"),
                instant(rs.getTimestamp("due_at")),
                instant(rs.getTimestamp("created_at")),
                instant(rs.getTimestamp("completed_at"))),
        args);
  }

  private static Instant instant(Timestamp value) {
    return value == null ? null : value.toInstant();
  }
}
