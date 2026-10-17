package com.mirinae.market.modules.store.data;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MarketLocationData {
  private static final String MARKETS =
      "SELECT m.id,m.name,m.region_code,r.province_code,m.address,m.latitude,m.longitude,"
          + "CASE WHEN r.code IS NULL THEN '위치 미등록' WHEN r.province_code='36' THEN r.province_short_name "
          + "ELSE r.province_short_name || ' ' || r.district_name END AS region_label "
          + "FROM markets m LEFT JOIN market_regions r ON r.code=m.region_code ";
  private final JdbcTemplate jdbc;

  public MarketLocationData(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<RegionRow> regions() {
    return jdbc.query(
        "SELECT * FROM market_regions WHERE selectable ORDER BY code",
        (rs, n) ->
            new RegionRow(
                rs.getString("code"),
                rs.getString("province_code"),
                rs.getString("province_name"),
                rs.getString("province_short_name"),
                rs.getString("district_name")));
  }

  public boolean regionExists(String code) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM market_regions WHERE code=? AND selectable)",
            Boolean.class,
            code));
  }

  public List<LocatedMarketRow> markets(boolean publicOnly) {
    String restriction =
        publicOnly
            ? "WHERE EXISTS(SELECT 1 FROM stores s JOIN accounts a ON a.id=s.owner_account_id WHERE s.market_id=m.id AND a.role='SELLER') "
            : "";
    return jdbc.query(MARKETS + restriction + "ORDER BY m.id", (rs, n) -> market(rs));
  }

  public LocatedMarketRow find(long id) {
    return jdbc.query(MARKETS + "WHERE m.id=?", (rs, n) -> market(rs), id).stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("시장을 찾을 수 없습니다."));
  }

  public void lock(long id) {
    if (jdbc.queryForList("SELECT id FROM markets WHERE id=? FOR UPDATE", Long.class, id)
        .isEmpty()) {
      throw new IllegalArgumentException("시장을 찾을 수 없습니다.");
    }
  }

  public long create(
      String name, String region, String address, double latitude, double longitude) {
    return jdbc.queryForObject(
        "INSERT INTO markets(name,region_code,address,latitude,longitude) VALUES (?,?,?,?,?) RETURNING id",
        Long.class,
        name,
        region,
        address,
        latitude,
        longitude);
  }

  public void update(
      long id, String name, String region, String address, Double latitude, Double longitude) {
    jdbc.update(
        "UPDATE markets SET name=?,region_code=?,address=?,latitude=?,longitude=? WHERE id=?",
        name,
        region,
        address,
        latitude,
        longitude,
        id);
  }

  public List<MarketCandidateRow> candidates(
      String query, int page, String province, String region) {
    return jdbc.query(
        "SELECT c.* FROM market_candidates c LEFT JOIN market_regions r ON r.code=c.region_code "
            + "WHERE (position(lower(?) in lower(c.name))>0 OR position(lower(?) in lower(coalesce(c.address,'')))>0) "
            + "AND (CAST(? AS text) IS NULL OR r.province_code=?) "
            + "AND (CAST(? AS text) IS NULL OR c.region_code=?) ORDER BY c.name,c.id LIMIT 51 OFFSET ?",
        (rs, n) ->
            new MarketCandidateRow(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("region_code"),
                rs.getString("address"),
                rs.getObject("latitude", Double.class),
                rs.getObject("longitude", Double.class),
                rs.getObject("source_date", java.time.LocalDate.class)),
        query,
        query,
        province,
        province,
        region,
        region,
        page * 50);
  }

  private static LocatedMarketRow market(ResultSet rs) throws SQLException {
    return new LocatedMarketRow(
        rs.getLong("id"),
        rs.getString("name"),
        rs.getString("region_code"),
        rs.getString("province_code"),
        rs.getString("region_label"),
        rs.getString("address"),
        rs.getObject("latitude", Double.class),
        rs.getObject("longitude", Double.class));
  }
}
