package com.mirinae.market.modules.admin.data;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AdministratorData {
  private final JdbcTemplate jdbc;

  public AdministratorData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void record(
      long actorId, Instant time, String type, long targetId, String before, String after) {
    jdbc.update(
        "INSERT INTO administrator_changes(actor_id,occurred_at,target_type,target_id,before_value,after_value) VALUES (?,?,?,?,?,?)",
        actorId,
        Timestamp.from(time),
        type,
        targetId,
        before,
        after);
  }

  public List<Map<String, Object>> history(
      String type, Long targetId, Instant from, Instant until, int page) {
    return jdbc.queryForList(
        "SELECT h.id,a.login_id AS \"actorLoginId\",CAST(h.occurred_at AS text) AS \"occurredAt\",h.target_type AS \"targetType\",h.target_id AS \"targetId\",h.before_value AS \"beforeValue\",h.after_value AS \"afterValue\" FROM administrator_changes h JOIN accounts a ON a.id=h.actor_id WHERE (?='' OR h.target_type=?) AND (?=0 OR h.target_id=?) AND h.occurred_at>=? AND h.occurred_at<? ORDER BY h.id DESC LIMIT 51 OFFSET ?",
        type,
        type,
        targetId == null ? 0 : targetId,
        targetId == null ? 0 : targetId,
        Timestamp.from(from),
        Timestamp.from(until),
        page * 50);
  }
}
