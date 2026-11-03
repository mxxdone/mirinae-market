package com.mirinae.market.modules.review.data;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ReviewData {
  private static final String REVIEWS =
      """
      SELECT r.*,s.name AS store_name,
        EXISTS(SELECT 1 FROM review_deletion_requests q WHERE q.review_id=r.id AND q.status='PENDING') AS deletion_requested
      FROM store_reviews r JOIN stores s ON s.id=r.store_id
      """;
  private static final String REQUESTS =
      """
      SELECT q.*,r.store_id,s.name AS store_name,r.rating,r.content
      FROM review_deletion_requests q JOIN store_reviews r ON r.id=q.review_id
      JOIN stores s ON s.id=r.store_id
      """;
  private final JdbcTemplate jdbc;

  public ReviewData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<ReviewRow> byOrder(long orderId, boolean lock) {
    return jdbc
        .query(
            REVIEWS + "WHERE r.store_order_id=?" + (lock ? " FOR UPDATE OF r" : ""),
            (rs, n) -> review(rs),
            orderId)
        .stream()
        .findFirst();
  }

  public Optional<ReviewRow> byId(long id, boolean lock) {
    return jdbc
        .query(
            REVIEWS + "WHERE r.id=?" + (lock ? " FOR UPDATE OF r" : ""), (rs, n) -> review(rs), id)
        .stream()
        .findFirst();
  }

  public boolean insert(long order, long store, int rating, String text, Instant now) {
    return jdbc.update(
            "INSERT INTO store_reviews(store_order_id,store_id,rating,content,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(store_order_id) DO NOTHING",
            order,
            store,
            rating,
            text,
            Timestamp.from(now),
            Timestamp.from(now))
        == 1;
  }

  public void edit(long id, int rating, String text, Instant now) {
    jdbc.update(
        "UPDATE store_reviews SET rating=?,content=?,updated_at=? WHERE id=?",
        rating,
        text,
        Timestamp.from(now),
        id);
  }

  public void authorDelete(long id, Instant now) {
    jdbc.update(
        "UPDATE store_reviews SET author_deleted_at=coalesce(author_deleted_at,?) WHERE id=?",
        Timestamp.from(now),
        id);
  }

  public void authorRestore(long id) {
    jdbc.update("UPDATE store_reviews SET author_deleted_at=NULL WHERE id=?", id);
  }

  public void adminDelete(long id, long actor, String reason, Instant now) {
    jdbc.update(
        "UPDATE store_reviews SET admin_deleted_at=?,admin_deleted_by=?,admin_reason=? WHERE id=?",
        Timestamp.from(now),
        actor,
        reason,
        id);
  }

  public void adminRestore(long id) {
    jdbc.update(
        "UPDATE store_reviews SET admin_deleted_at=NULL,admin_deleted_by=NULL,admin_reason=NULL WHERE id=?",
        id);
  }

  public void reply(long id, String text, Instant now) {
    jdbc.update(
        "UPDATE store_reviews SET reply_content=?,reply_updated_at=? WHERE id=?",
        text,
        Timestamp.from(now),
        id);
  }

  public List<ReviewRow> page(Long storeId, boolean includeDeleted, int offset, int limit) {
    String filter =
        "WHERE "
            + (includeDeleted ? "true" : "NOT r.is_deleted")
            + (storeId == null ? "" : " AND r.store_id=?");
    Object[] args =
        storeId == null ? new Object[] {limit, offset} : new Object[] {storeId, limit, offset};
    return jdbc.query(
        REVIEWS + filter + " ORDER BY r.id DESC LIMIT ? OFFSET ?", (rs, n) -> review(rs), args);
  }

  public long count(Long storeId, boolean includeDeleted) {
    String filter = " WHERE " + (includeDeleted ? "true" : "NOT is_deleted");
    return storeId == null
        ? jdbc.queryForObject("SELECT count(*) FROM store_reviews" + filter, Long.class)
        : jdbc.queryForObject(
            "SELECT count(*) FROM store_reviews" + filter + " AND store_id=?", Long.class, storeId);
  }

  public List<ReviewSummaryRow> summaries(List<Long> ids) {
    String values = String.join(",", Collections.nCopies(ids.size(), "(?::bigint)"));
    return jdbc.query(
        "SELECT input.id AS store_id,round(avg(r.rating),1) AS average_rating,count(r.id) AS review_count FROM (VALUES "
            + values
            + ") input(id) LEFT JOIN store_reviews r ON r.store_id=input.id AND NOT r.is_deleted GROUP BY input.id ORDER BY input.id",
        (rs, n) ->
            new ReviewSummaryRow(
                rs.getLong("store_id"),
                rs.getBigDecimal("average_rating"),
                rs.getLong("review_count")),
        ids.toArray());
  }

  public void request(long review, long actor, String reason, Instant now) {
    jdbc.update(
        "INSERT INTO review_deletion_requests(review_id,requested_by,reason,created_at) VALUES (?,?,?,?) ON CONFLICT(review_id) WHERE status='PENDING' DO NOTHING",
        review,
        actor,
        reason,
        Timestamp.from(now));
  }

  public Optional<DeletionRequestRow> pendingRequest(long review) {
    return jdbc
        .query(
            REQUESTS + "WHERE q.review_id=? AND q.status='PENDING'",
            (rs, n) -> requestRow(rs),
            review)
        .stream()
        .findFirst();
  }

  public Optional<DeletionRequestRow> request(long id, boolean lock) {
    return jdbc
        .query(
            REQUESTS + "WHERE q.id=?" + (lock ? " FOR UPDATE OF q" : ""),
            (rs, n) -> requestRow(rs),
            id)
        .stream()
        .findFirst();
  }

  public List<DeletionRequestRow> requests(int offset, int limit) {
    return jdbc.query(
        REQUESTS + "WHERE q.status='PENDING' ORDER BY q.id DESC LIMIT ? OFFSET ?",
        (rs, n) -> requestRow(rs),
        limit,
        offset);
  }

  public long requestCount() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM review_deletion_requests WHERE status='PENDING'", Long.class);
  }

  public void decide(long id, long actor, String status, String reason, Instant now) {
    jdbc.update(
        "UPDATE review_deletion_requests SET status=?,decision_reason=?,decided_by=?,decided_at=? WHERE id=?",
        status,
        reason,
        actor,
        Timestamp.from(now),
        id);
  }

  private static ReviewRow review(ResultSet rs) throws SQLException {
    return new ReviewRow(
        rs.getLong("id"),
        rs.getLong("store_order_id"),
        rs.getLong("store_id"),
        rs.getString("store_name"),
        rs.getInt("rating"),
        rs.getString("content"),
        instant(rs, "created_at"),
        instant(rs, "updated_at"),
        instant(rs, "author_deleted_at"),
        instant(rs, "admin_deleted_at"),
        rs.getString("admin_reason"),
        rs.getString("reply_content"),
        instant(rs, "reply_updated_at"),
        rs.getBoolean("deletion_requested"));
  }

  private static DeletionRequestRow requestRow(ResultSet rs) throws SQLException {
    return new DeletionRequestRow(
        rs.getLong("id"),
        rs.getLong("review_id"),
        rs.getLong("store_id"),
        rs.getString("store_name"),
        rs.getInt("rating"),
        rs.getString("content"),
        rs.getString("reason"),
        rs.getString("status"),
        rs.getString("decision_reason"),
        instant(rs, "created_at"));
  }

  private static Instant instant(ResultSet rs, String name) throws SQLException {
    var timestamp = rs.getTimestamp(name);
    return timestamp == null ? null : timestamp.toInstant();
  }
}
