package com.mirinae.market.modules.store.data;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StoreOperationData {
  private static final String REPORT_SELECT =
      "SELECT r.*,s.name AS store_name,b.login_id AS buyer_login_id,a.contact_name,a.contact_phone,a.email,(SELECT count(DISTINCT x.buyer_id) FROM store_reports x WHERE x.store_id=r.store_id AND x.type='CLOSURE_SUSPECTED' AND x.status<>'RESOLVED') AS closure_count FROM store_reports r JOIN stores s ON s.id=r.store_id JOIN accounts b ON b.id=r.buyer_id JOIN accounts a ON a.id=s.owner_account_id ";
  private final JdbcTemplate jdbc;

  public StoreOperationData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public boolean suspended(long store) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject("SELECT suspended FROM stores WHERE id=?", Boolean.class, store));
  }

  public boolean exists(long store) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM stores WHERE id=?)", Boolean.class, store));
  }

  public void operation(long store, boolean suspended, long actor, String reason, Instant now) {
    jdbc.update(
        "UPDATE stores SET suspended=?,operation_reason=?,operation_actor=?,operation_updated_at=? WHERE id=?",
        suspended,
        reason,
        actor,
        Timestamp.from(now),
        store);
  }

  public Optional<StoreReportRow> report(long id) {
    return reports("WHERE r.id=?", id).stream().findFirst();
  }

  public List<StoreReportRow> ownReports(long store, long buyer) {
    return reports(
        "WHERE r.store_id=? AND r.buyer_id=? ORDER BY r.id DESC LIMIT 100", store, buyer);
  }

  public List<StoreReportRow> managedReports(String status, int page) {
    return reports(
        "WHERE (?='' OR r.status=?) ORDER BY r.id DESC LIMIT 51 OFFSET ?",
        status,
        status,
        page * 50);
  }

  public long report(long store, long buyer, String type, String description, Instant now) {
    return jdbc.queryForObject(
        "INSERT INTO store_reports(store_id,buyer_id,type,description,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(buyer_id,store_id,type) WHERE status<>'RESOLVED' DO UPDATE SET buyer_id=EXCLUDED.buyer_id RETURNING id",
        Long.class,
        store,
        buyer,
        type,
        description,
        Timestamp.from(now),
        Timestamp.from(now));
  }

  public void lockReport(long id) {
    jdbc.queryForObject("SELECT id FROM store_reports WHERE id=? FOR UPDATE", Long.class, id);
  }

  public void resolve(long id, String status, String resolution, long actor, Instant now) {
    jdbc.update(
        "UPDATE store_reports SET status=?,resolution=?,updated_by=?,updated_at=? WHERE id=?",
        status,
        resolution,
        actor,
        Timestamp.from(now),
        id);
  }

  private List<StoreReportRow> reports(String suffix, Object... args) {
    return jdbc.query(
        REPORT_SELECT + suffix,
        (rs, n) ->
            new StoreReportRow(
                rs.getLong("id"),
                rs.getLong("store_id"),
                rs.getString("store_name"),
                rs.getLong("buyer_id"),
                rs.getString("type"),
                rs.getString("description"),
                rs.getString("status"),
                rs.getString("resolution"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(),
                rs.getString("buyer_login_id"),
                rs.getString("contact_name"),
                rs.getString("contact_phone"),
                rs.getString("email"),
                rs.getInt("closure_count")),
        args);
  }
}
