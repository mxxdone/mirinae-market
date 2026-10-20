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
public class CheckoutData {
  private final JdbcTemplate jdbc;

  public CheckoutData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<java.util.Map<String, Object>> managedOrders(String query, int page) {
    return jdbc.queryForList(
        "SELECT c.id,a.login_id AS \"buyerLoginId\",a.display_name AS \"buyerName\",CAST(c.total_won AS text) AS \"totalWon\",CAST(c.confirmed_at AS text) AS \"confirmedAt\" FROM checkouts c JOIN accounts a ON a.id=c.buyer_id WHERE c.status='CONFIRMED' AND (position(lower(?) in lower(a.login_id))>0 OR position(lower(?) in lower(a.display_name))>0 OR CAST(c.id AS text)=? OR EXISTS(SELECT 1 FROM store_orders s WHERE s.checkout_id=c.id AND position(lower(?) in lower(s.store_name))>0)) ORDER BY c.id DESC LIMIT 51 OFFSET ?",
        query,
        query,
        query,
        query,
        page * 50);
  }

  public List<java.util.Map<String, Object>> managedOrderItems(long id) {
    return jdbc.queryForList(
        "SELECT s.id AS \"storeOrderId\",s.store_id AS \"storeId\",s.store_name AS \"storeName\",CAST(s.pickup_date AS text) AS \"pickupDate\",CAST(s.start_time AS text) AS \"startTime\",CAST(s.end_time AS text) AS \"endTime\",i.product_name AS \"productName\",i.unit_type AS \"unitType\",i.unit_amount AS \"unitAmount\",i.price_won AS \"priceWon\",i.quantity FROM store_orders s JOIN order_items i ON i.store_order_id=s.id JOIN checkouts c ON c.id=s.checkout_id WHERE c.id=? AND c.status='CONFIRMED' ORDER BY s.id,i.id",
        id);
  }

  public void lockBuyer(long buyerId) {
    jdbc.update("INSERT INTO carts(buyer_id) VALUES (?) ON CONFLICT DO NOTHING", buyerId);
    jdbc.queryForObject(
        "SELECT buyer_id FROM carts WHERE buyer_id=? FOR UPDATE", Long.class, buyerId);
  }

  public long version(long buyerId) {
    return jdbc.queryForObject("SELECT version FROM carts WHERE buyer_id=?", Long.class, buyerId);
  }

  public void advance(long buyerId) {
    jdbc.update("UPDATE carts SET version=version+1 WHERE buyer_id=?", buyerId);
  }

  public List<LineRow> cart(long buyerId) {
    return lines("SELECT * FROM cart_items WHERE buyer_id=? ORDER BY offer_id", buyerId);
  }

  public List<LineRow> items(long checkoutId) {
    return lines("SELECT * FROM checkout_items WHERE checkout_id=? ORDER BY offer_id", checkoutId);
  }

  private List<LineRow> lines(String sql, long id) {
    return jdbc.query(
        sql,
        (rs, n) ->
            new LineRow(
                rs.getLong("offer_id"),
                rs.getInt("quantity"),
                rs.getInt("expected_price"),
                rs.getObject("start_time", LocalTime.class),
                rs.getObject("end_time", LocalTime.class),
                rs.getObject("order_deadline", LocalTime.class)),
        id);
  }

  public void cartItem(long buyerId, LineRow line) {
    jdbc.update(
        "INSERT INTO cart_items(buyer_id,offer_id,quantity,expected_price,start_time,end_time,order_deadline) VALUES (?,?,?,?,?,?,?) ON CONFLICT(buyer_id,offer_id) DO UPDATE SET quantity=EXCLUDED.quantity,expected_price=EXCLUDED.expected_price,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,order_deadline=EXCLUDED.order_deadline",
        buyerId,
        line.offerId(),
        line.quantity(),
        line.expectedPrice(),
        line.startTime(),
        line.endTime(),
        line.orderDeadline());
  }

  public void remove(long buyerId, long offerId) {
    jdbc.update("DELETE FROM cart_items WHERE buyer_id=? AND offer_id=?", buyerId, offerId);
  }

  public void clear(long buyerId) {
    jdbc.update("DELETE FROM cart_items WHERE buyer_id=?", buyerId);
    advance(buyerId);
  }

  public Optional<CheckoutRow> find(long buyerId, String key) {
    return rows("SELECT * FROM checkouts WHERE buyer_id=? AND request_key=?", buyerId, key).stream()
        .findFirst();
  }

  public Optional<CheckoutRow> atVersion(long buyerId, long version) {
    return rows("SELECT * FROM checkouts WHERE buyer_id=? AND cart_version=?", buyerId, version)
        .stream()
        .findFirst();
  }

  public List<CheckoutRow> due(Instant now) {
    return rows(
        "SELECT * FROM checkouts WHERE status='PENDING' AND due_at<=? ORDER BY attempts,id LIMIT 100",
        Timestamp.from(now));
  }

  public List<CheckoutRow> history(long buyerId) {
    return rows("SELECT * FROM checkouts WHERE buyer_id=? ORDER BY id DESC LIMIT 100", buyerId);
  }

  public Optional<StatementRow> confirmedStatement(long buyerId, long checkoutId) {
    // 본인·확정 주문만 조회하며 없는 주문·타인 주문·미확정 주문은 같은 결과로 구분하지 않는다.
    return jdbc
        .query(
            "SELECT id,total_won,confirmed_at FROM checkouts WHERE id=? AND buyer_id=? AND status='CONFIRMED'",
            (rs, n) ->
                new StatementRow(
                    rs.getLong("id"),
                    rs.getLong("total_won"),
                    rs.getTimestamp("confirmed_at").toInstant()),
            checkoutId,
            buyerId)
        .stream()
        .findFirst();
  }

  private List<CheckoutRow> rows(String sql, Object... args) {
    return jdbc.query(
        sql,
        (rs, n) ->
            new CheckoutRow(
                rs.getLong("id"),
                rs.getLong("buyer_id"),
                rs.getString("request_key"),
                rs.getLong("cart_version"),
                rs.getString("mode"),
                rs.getString("status"),
                rs.getString("error_code"),
                rs.getString("message"),
                rs.getLong("total_won"),
                rs.getTimestamp("due_at").toInstant()),
        args);
  }

  public CheckoutRow prepare(
      long buyerId, String key, long version, String mode, Instant now, List<LineRow> lines) {
    Instant due = now.plusSeconds(mode.equals("DELAY") ? 3 : 0);
    long id =
        jdbc.queryForObject(
            "INSERT INTO checkouts(buyer_id,request_key,cart_version,mode,status,due_at,created_at) VALUES (?,?,?,?,'PENDING',?,?) RETURNING id",
            Long.class,
            buyerId,
            key,
            version,
            mode,
            Timestamp.from(due),
            Timestamp.from(now));
    for (LineRow line : lines)
      jdbc.update(
          "INSERT INTO checkout_items(checkout_id,offer_id,quantity,expected_price,start_time,end_time,order_deadline) VALUES (?,?,?,?,?,?,?)",
          id,
          line.offerId(),
          line.quantity(),
          line.expectedPrice(),
          line.startTime(),
          line.endTime(),
          line.orderDeadline());
    return find(buyerId, key).orElseThrow();
  }

  public void attempted(long id) {
    jdbc.update("UPDATE checkouts SET attempts=attempts+1 WHERE id=? AND status='PENDING'", id);
  }

  public void failed(long id, String code, String message) {
    jdbc.update(
        "UPDATE checkouts SET status='FAILED',error_code=?,message=? WHERE id=? AND status='PENDING'",
        code,
        message,
        id);
  }

  public void confirmed(long id, long amount, Instant now) {
    jdbc.update(
        "UPDATE checkouts SET status='CONFIRMED',total_won=?,confirmed_at=? WHERE id=? AND status='PENDING'",
        amount,
        Timestamp.from(now),
        id);
  }

  public Optional<String> freePickupCode(long store, LocalDate date) {
    var candidate =
        jdbc
            .queryForList(
                "WITH seed AS MATERIALIZED(SELECT lpad(floor(random()*1000000)::text,6,'0') AS code) SELECT code FROM seed WHERE NOT EXISTS(SELECT 1 FROM store_orders s WHERE s.store_id=? AND s.pickup_date=? AND s.pickup_code=seed.code)",
                String.class,
                store,
                date)
            .stream()
            .findFirst();
    if (candidate.isPresent()) return candidate;
    return jdbc
        .queryForList(
            "WITH seed AS MATERIALIZED(SELECT floor(random()*1000000)::integer AS start) SELECT lpad(((n+seed.start)%1000000)::text,6,'0') FROM seed CROSS JOIN generate_series(0,999999) n WHERE NOT EXISTS(SELECT 1 FROM store_orders s WHERE s.store_id=? AND s.pickup_date=? AND s.pickup_code=lpad(((n+seed.start)%1000000)::text,6,'0')) LIMIT 1",
            String.class, store, date)
        .stream()
        .findFirst();
  }

  public long storeOrder(
      long checkoutId,
      long storeId,
      long marketId,
      String storeName,
      LocalDate date,
      LocalTime start,
      LocalTime end,
      LocalTime deadline,
      String pickupCode) {
    return jdbc.queryForObject(
        "INSERT INTO store_orders(checkout_id,store_id,market_id,store_name,pickup_date,start_time,end_time,order_deadline,pickup_code) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(checkout_id,store_id) DO UPDATE SET store_id=EXCLUDED.store_id RETURNING id",
        Long.class,
        checkoutId,
        storeId,
        marketId,
        storeName,
        date,
        start,
        end,
        deadline,
        pickupCode);
  }

  public void orderItem(
      long storeOrderId,
      long offerId,
      String name,
      String type,
      int amount,
      int price,
      int quantity) {
    jdbc.update(
        "INSERT INTO order_items(store_order_id,offer_id,product_name,unit_type,unit_amount,price_won,quantity) VALUES (?,?,?,?,?,?,?)",
        storeOrderId,
        offerId,
        name,
        type,
        amount,
        price,
        quantity);
  }

  public List<OrderRow> orders(long id) {
    return jdbc.query(
        "SELECT s.*,i.product_name,i.unit_type,i.unit_amount,i.price_won,i.quantity FROM store_orders s JOIN order_items i ON i.store_order_id=s.id WHERE s.checkout_id=? ORDER BY s.id,i.id",
        (rs, n) ->
            new OrderRow(
                rs.getLong("id"),
                rs.getLong("store_id"),
                rs.getString("store_name"),
                rs.getObject("pickup_date", LocalDate.class),
                rs.getObject("start_time", LocalTime.class),
                rs.getObject("end_time", LocalTime.class),
                rs.getObject("order_deadline", LocalTime.class),
                rs.getString("product_name"),
                rs.getString("unit_type"),
                rs.getInt("unit_amount"),
                rs.getInt("price_won"),
                rs.getInt("quantity")),
        id);
  }
}
