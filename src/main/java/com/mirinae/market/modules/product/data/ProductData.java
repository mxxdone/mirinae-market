package com.mirinae.market.modules.product.data;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProductData {
  private static final String OFFER_SELECT =
      """
      SELECT o.id, p.id AS product_id, s.market_id, s.id AS store_id, s.name AS store_name,
             p.name AS product_name, p.description, p.unit_type, p.unit_amount, o.pickup_date,
             o.price_won, o.online_quantity, o.inventory_version, w.start_time, w.end_time, w.order_deadline
      FROM daily_offers o JOIN products p ON p.id = o.product_id
      JOIN stores s ON s.id = p.store_id
      JOIN pickup_windows w ON w.store_id = o.store_id AND w.pickup_date = o.pickup_date
      """;
  private static final String PRODUCT_SELECT =
      "SELECT p.*, EXISTS (SELECT 1 FROM daily_offers o WHERE o.product_id = p.id) AS has_sales FROM products p ";
  private static final String OFFER_FILTER =
      " WHERE s.market_id = ? AND o.pickup_date = ? AND w.order_deadline > ? AND o.active AND NOT s.suspended AND p.archived_at IS NULL AND position(lower(?) in lower(p.name)) > 0 ";
  private final JdbcTemplate jdbc;

  public ProductData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<java.util.Map<String, Object>> managedSales(LocalDate date, String query, int page) {
    return jdbc.queryForList(
        "SELECT o.id,s.id AS \"storeId\",s.name AS \"storeName\",p.name AS \"productName\",p.unit_type AS \"unitType\",p.unit_amount AS \"unitAmount\",o.price_won AS \"priceWon\",o.online_quantity AS \"onlineQuantity\",o.active,p.archived_at IS NOT NULL AS archived,CAST(o.pickup_date AS text) AS \"pickupDate\" FROM daily_offers o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=o.store_id WHERE o.pickup_date=? AND (position(lower(?) in lower(s.name))>0 OR position(lower(?) in lower(p.name))>0) ORDER BY s.id,o.id LIMIT 51 OFFSET ?",
        date,
        query,
        query,
        page * 50);
  }

  public void lockStore(long storeId) {
    jdbc.queryForObject("SELECT id FROM stores WHERE id = ? FOR UPDATE", Long.class, storeId);
  }

  public ProductRow create(
      long storeId, String name, String description, String unitType, int unitAmount) {
    Long id =
        jdbc.queryForObject(
            """
        INSERT INTO products (store_id, name, description, unit_type, unit_amount)
        VALUES (?, ?, ?, ?, ?) RETURNING id
        """,
            Long.class,
            storeId,
            name,
            description,
            unitType,
            unitAmount);
    return new ProductRow(id, storeId, name, description, unitType, unitAmount, false);
  }

  public Optional<ProductRow> product(long storeId, long productId) {
    return jdbc
        .query(
            PRODUCT_SELECT + "WHERE p.store_id = ? AND p.id = ? AND p.archived_at IS NULL",
            (rs, row) -> productRow(rs),
            storeId,
            productId)
        .stream()
        .findFirst();
  }

  public List<ProductRow> products(long storeId, int offset, int limit) {
    return jdbc.query(
        PRODUCT_SELECT
            + "WHERE p.store_id = ? AND p.archived_at IS NULL ORDER BY p.id LIMIT ? OFFSET ?",
        (rs, row) -> productRow(rs),
        storeId,
        limit,
        offset);
  }

  public long productCount(long storeId) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM products WHERE store_id = ? AND archived_at IS NULL",
        Long.class,
        storeId);
  }

  public boolean hasProduct(long storeId, long productId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM products WHERE store_id = ? AND id = ?)",
            Boolean.class,
            storeId,
            productId));
  }

  public void archive(long storeId, long productId) {
    jdbc.update(
        "UPDATE products SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP) WHERE store_id = ? AND id = ?",
        storeId,
        productId);
  }

  public void update(
      long storeId, long productId, String name, String description, String unitType, int amount) {
    jdbc.update(
        """
        UPDATE products SET name = ?, description = ?, unit_type = ?, unit_amount = ?
        WHERE store_id = ? AND id = ?
        """,
        name,
        description,
        unitType,
        amount,
        storeId,
        productId);
  }

  public void window(
      long storeId, LocalDate date, LocalTime start, LocalTime end, LocalTime deadline) {
    jdbc.update(
        """
        INSERT INTO pickup_windows (store_id, pickup_date, start_time, end_time, order_deadline) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (store_id, pickup_date) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, order_deadline = EXCLUDED.order_deadline
        """,
        storeId,
        date,
        start,
        end,
        deadline);
  }

  public Optional<WindowRow> findWindow(long storeId, LocalDate date) {
    return jdbc
        .query(
            "SELECT start_time, end_time, order_deadline FROM pickup_windows WHERE store_id = ? AND pickup_date = ?",
            (rs, row) ->
                new WindowRow(
                    rs.getObject("start_time", LocalTime.class),
                    rs.getObject("end_time", LocalTime.class),
                    rs.getObject("order_deadline", LocalTime.class)),
            storeId,
            date)
        .stream()
        .findFirst();
  }

  public long offer(long storeId, long productId, LocalDate date, int price, int quantity) {
    return jdbc.queryForObject(
        """
        INSERT INTO daily_offers (store_id, product_id, pickup_date, price_won, online_quantity)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (product_id, pickup_date) DO UPDATE SET price_won = EXCLUDED.price_won, online_quantity = EXCLUDED.online_quantity, active = true, inventory_version = daily_offers.inventory_version + 1
        RETURNING id
        """,
        Long.class,
        storeId,
        productId,
        date,
        price,
        quantity);
  }

  public List<OfferRow> search(
      long marketId, LocalDate date, LocalTime now, String query, int offset, int limit) {
    return jdbc.query(
        OFFER_SELECT + OFFER_FILTER + "ORDER BY o.id LIMIT ? OFFSET ?",
        (rs, row) -> offerRow(rs),
        marketId,
        date,
        now,
        query,
        limit,
        offset);
  }

  public long offerCount(long marketId, LocalDate date, LocalTime now, String query) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM (" + OFFER_SELECT + OFFER_FILTER + ") visible",
        Long.class,
        marketId,
        date,
        now,
        query);
  }

  public Optional<OfferRow> detail(long marketId, LocalDate date, long offerId) {
    return jdbc
        .query(
            OFFER_SELECT
                + " WHERE s.market_id = ? AND o.pickup_date = ? AND o.id = ? AND o.active AND NOT s.suspended AND p.archived_at IS NULL",
            (rs, row) -> offerRow(rs),
            marketId,
            date,
            offerId)
        .stream()
        .findFirst();
  }

  public void stopOffer(long storeId, long productId, LocalDate date) {
    jdbc.update(
        "UPDATE daily_offers SET active = false WHERE store_id = ? AND product_id = ? AND pickup_date = ?",
        storeId,
        productId,
        date);
  }

  public List<SaleProductRow> saleProducts(long storeId, LocalDate date, int offset, int limit) {
    return jdbc.query(
        """
      SELECT p.*, EXISTS (SELECT 1 FROM daily_offers h WHERE h.product_id = p.id) AS has_sales,
             o.active AS selling, o.price_won, o.online_quantity, o.inventory_version
      FROM products p LEFT JOIN daily_offers o ON o.product_id = p.id AND o.pickup_date = ?
      WHERE p.store_id = ? AND p.archived_at IS NULL ORDER BY p.id LIMIT ? OFFSET ?
      """,
        (rs, row) ->
            new SaleProductRow(
                productRow(rs),
                rs.getBoolean("selling"),
                rs.getObject("price_won", Integer.class),
                rs.getObject("online_quantity", Integer.class),
                rs.getObject("inventory_version", Long.class)),
        date,
        storeId,
        limit,
        offset);
  }

  public Optional<CheckoutOfferRow> checkoutOffer(long offerId) {
    return jdbc
        .query(
            OFFER_SELECT.replace("SELECT o.id", "SELECT o.active, s.suspended, p.archived_at, o.id")
                + " WHERE o.id = ?",
            (rs, n) ->
                new CheckoutOfferRow(
                    offerRow(rs),
                    rs.getBoolean("active"),
                    rs.getTimestamp("archived_at") != null,
                    rs.getBoolean("suspended")),
            offerId)
        .stream()
        .findFirst();
  }

  public void consume(long offerId, int quantity) {
    if (jdbc.update(
            "UPDATE daily_offers SET online_quantity=online_quantity-?,inventory_version=inventory_version+1 WHERE id=? AND online_quantity>=?",
            quantity,
            offerId,
            quantity)
        != 1) throw new IllegalStateException("재고 차감 조건이 변경되었습니다.");
  }

  public void restore(long offerId, int quantity) {
    jdbc.update(
        "UPDATE daily_offers o SET online_quantity=(online_quantity::bigint+?)::integer,inventory_version=inventory_version+1 FROM products p WHERE o.id=? AND p.id=o.product_id AND o.active AND p.archived_at IS NULL",
        quantity,
        offerId);
  }

  public void lockWindow(long storeId, LocalDate date) {
    jdbc.update(
        "UPDATE pickup_windows SET orders_locked=true WHERE store_id=? AND pickup_date=?",
        storeId,
        date);
  }

  public boolean windowLocked(long storeId, LocalDate date) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM pickup_windows WHERE store_id=? AND pickup_date=? AND orders_locked)",
            Boolean.class,
            storeId,
            date));
  }

  public Optional<Long> inventoryVersion(long storeId, long productId, LocalDate date) {
    return jdbc
        .query(
            "SELECT inventory_version FROM daily_offers WHERE store_id=? AND product_id=? AND pickup_date=?",
            (rs, n) -> rs.getLong(1),
            storeId,
            productId,
            date)
        .stream()
        .findFirst();
  }

  private static ProductRow productRow(ResultSet rs) throws SQLException {
    return new ProductRow(
        rs.getLong("id"),
        rs.getLong("store_id"),
        rs.getString("name"),
        rs.getString("description"),
        rs.getString("unit_type"),
        rs.getInt("unit_amount"),
        rs.getBoolean("has_sales"));
  }

  private static OfferRow offerRow(ResultSet rs) throws SQLException {
    return new OfferRow(
        rs.getLong("id"),
        rs.getLong("product_id"),
        rs.getLong("market_id"),
        rs.getLong("store_id"),
        rs.getString("store_name"),
        rs.getString("product_name"),
        rs.getString("description"),
        rs.getString("unit_type"),
        rs.getInt("unit_amount"),
        rs.getObject("pickup_date", LocalDate.class),
        rs.getInt("price_won"),
        rs.getInt("online_quantity"),
        rs.getLong("inventory_version"),
        rs.getObject("start_time", LocalTime.class),
        rs.getObject("end_time", LocalTime.class),
        rs.getObject("order_deadline", LocalTime.class));
  }
}
