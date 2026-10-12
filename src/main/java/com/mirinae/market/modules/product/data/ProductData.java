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
             o.price_won, o.online_quantity, w.start_time, w.end_time
      FROM daily_offers o JOIN products p ON p.id = o.product_id
      JOIN stores s ON s.id = p.store_id
      JOIN pickup_windows w ON w.store_id = o.store_id AND w.pickup_date = o.pickup_date
      """;
  private final JdbcTemplate jdbc;

  public ProductData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
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
    return new ProductRow(id, storeId, name, description, unitType, unitAmount);
  }

  public Optional<ProductRow> product(long storeId, long productId) {
    return jdbc
        .query(
            "SELECT * FROM products WHERE store_id = ? AND id = ?",
            (rs, row) -> productRow(rs),
            storeId,
            productId)
        .stream()
        .findFirst();
  }

  public List<ProductRow> products(long storeId, int offset, int limit) {
    return jdbc.query(
        "SELECT * FROM products WHERE store_id = ? ORDER BY id LIMIT ? OFFSET ?",
        (rs, row) -> productRow(rs),
        storeId,
        limit,
        offset);
  }

  public boolean hasOffers(long productId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM daily_offers WHERE product_id = ?)",
            Boolean.class,
            productId));
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

  public void window(long storeId, LocalDate date, LocalTime start, LocalTime end) {
    jdbc.update(
        """
        INSERT INTO pickup_windows (store_id, pickup_date, start_time, end_time) VALUES (?, ?, ?, ?)
        ON CONFLICT (store_id, pickup_date) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time
        """,
        storeId,
        date,
        start,
        end);
  }

  public Optional<WindowRow> findWindow(long storeId, LocalDate date) {
    return jdbc
        .query(
            "SELECT start_time, end_time FROM pickup_windows WHERE store_id = ? AND pickup_date = ?",
            (rs, row) ->
                new WindowRow(
                    rs.getObject("start_time", LocalTime.class),
                    rs.getObject("end_time", LocalTime.class)),
            storeId,
            date)
        .stream()
        .findFirst();
  }

  public boolean hasWindow(long storeId, LocalDate date) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
        SELECT EXISTS (SELECT 1 FROM pickup_windows WHERE store_id = ? AND pickup_date = ?)
        """,
            Boolean.class,
            storeId,
            date));
  }

  public long offer(long storeId, long productId, LocalDate date, int price, int quantity) {
    return jdbc.queryForObject(
        """
        INSERT INTO daily_offers (store_id, product_id, pickup_date, price_won, online_quantity)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (product_id, pickup_date) DO UPDATE SET price_won = EXCLUDED.price_won, online_quantity = EXCLUDED.online_quantity
        RETURNING id
        """,
        Long.class,
        storeId,
        productId,
        date,
        price,
        quantity);
  }

  public List<OfferRow> search(long marketId, LocalDate date, String query, int offset, int limit) {
    return jdbc.query(
        OFFER_SELECT
            + """
        WHERE s.market_id = ? AND o.pickup_date = ? AND position(lower(?) in lower(p.name)) > 0
        ORDER BY o.id LIMIT ? OFFSET ?
        """,
        (rs, row) -> offerRow(rs),
        marketId,
        date,
        query,
        limit,
        offset);
  }

  public Optional<OfferRow> detail(long marketId, LocalDate date, long offerId) {
    return jdbc
        .query(
            OFFER_SELECT + " WHERE s.market_id = ? AND o.pickup_date = ? AND o.id = ?",
            (rs, row) -> offerRow(rs),
            marketId,
            date,
            offerId)
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
        rs.getInt("unit_amount"));
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
        rs.getObject("start_time", LocalTime.class),
        rs.getObject("end_time", LocalTime.class));
  }
}
