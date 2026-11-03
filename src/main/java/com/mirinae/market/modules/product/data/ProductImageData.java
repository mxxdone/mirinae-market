package com.mirinae.market.modules.product.data;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProductImageData {
  private final JdbcTemplate jdbc;

  public ProductImageData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private static ProductImageRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
    var deadline = rs.getTimestamp("delete_after");
    return new ProductImageRow(
        rs.getString("id"),
        rs.getLong("store_id"),
        rs.getObject("product_id", Long.class),
        rs.getString("state"),
        rs.getInt("width"),
        rs.getInt("height"),
        deadline == null ? null : deadline.toInstant());
  }

  public void stage(String id, long store, int width, int height, Instant now, Instant deadline) {
    jdbc.update(
        "INSERT INTO product_images(id,store_id,state,width,height,created_at,delete_after) VALUES (?,?,'STAGED',?,?,?,?)",
        UUID.fromString(id),
        store,
        width,
        height,
        Timestamp.from(now),
        Timestamp.from(deadline));
  }

  public Optional<ProductImageRow> lock(String id) {
    return jdbc
        .query(
            "SELECT * FROM product_images WHERE id=? FOR UPDATE",
            (rs, n) -> row(rs),
            UUID.fromString(id))
        .stream()
        .findFirst();
  }

  public Optional<ProductImageRow> current(long product) {
    return jdbc
        .query(
            "SELECT * FROM product_images WHERE product_id=? AND state='ACTIVE'",
            (rs, n) -> row(rs),
            product)
        .stream()
        .findFirst();
  }

  public void retire(long product, Instant deadline) {
    jdbc.update(
        "UPDATE product_images SET state='RETIRED',product_id=NULL,delete_after=? WHERE product_id=? AND state='ACTIVE'",
        Timestamp.from(deadline),
        product);
  }

  public void attach(String id, long product) {
    jdbc.update(
        "UPDATE product_images SET state='ACTIVE',product_id=?,delete_after=NULL WHERE id=?",
        product,
        UUID.fromString(id));
  }

  public List<ProductImageRow> due(Instant now) {
    return jdbc.query(
        "SELECT * FROM product_images WHERE state<>'ACTIVE' AND delete_after<=? ORDER BY delete_after LIMIT 100 FOR UPDATE SKIP LOCKED",
        (rs, n) -> row(rs),
        Timestamp.from(now));
  }

  public void remove(String id) {
    jdbc.update("DELETE FROM product_images WHERE id=? AND state<>'ACTIVE'", UUID.fromString(id));
  }

  public boolean exists(String id) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM product_images WHERE id=?)",
            Boolean.class,
            UUID.fromString(id)));
  }

  public List<ProductImageRow> publicImages(long market, List<Long> products) {
    var placeholders = String.join(",", java.util.Collections.nCopies(products.size(), "?"));
    var args = new java.util.ArrayList<Object>();
    args.add(market);
    args.addAll(products);
    return jdbc.query(
        "SELECT i.* FROM product_images i JOIN products p ON p.id=i.product_id JOIN stores s ON s.id=p.store_id JOIN accounts a ON a.id=s.owner_account_id WHERE i.state='ACTIVE' AND p.archived_at IS NULL AND NOT s.suspended AND a.role='SELLER' AND s.market_id=? AND p.id IN ("
            + placeholders
            + ")",
        (rs, n) -> row(rs),
        args.toArray());
  }
}
