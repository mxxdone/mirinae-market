package com.mirinae.market.modules.store.data;

import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class StoreData {
  private final org.springframework.jdbc.core.JdbcTemplate jdbc;
  private final StoreJpaRepository stores;
  private final MarketJpaRepository markets;

  StoreData(
      StoreJpaRepository stores,
      MarketJpaRepository markets,
      org.springframework.jdbc.core.JdbcTemplate jdbc) {
    this.jdbc = jdbc;
    this.stores = stores;
    this.markets = markets;
  }

  public MarketRow createMarket(String name) {
    long id =
        jdbc.queryForObject("INSERT INTO markets(name) VALUES (?) RETURNING id", Long.class, name);
    return new MarketRow(id, name);
  }

  public MarketRow lockMarket(long id) {
    return jdbc
        .query(
            "SELECT * FROM markets WHERE id=? FOR UPDATE",
            (rs, n) -> new MarketRow(rs.getLong("id"), rs.getString("name")),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("시장을 찾을 수 없습니다."));
  }

  public MarketRow renameMarket(long id, String name) {
    jdbc.update("UPDATE markets SET name=? WHERE id=?", name, id);
    return new MarketRow(id, name);
  }

  public StoreRow createStore(long marketId, long ownerId, String name) {
    long id =
        jdbc.queryForObject(
            "INSERT INTO stores(market_id,owner_account_id,name) VALUES (?,?,?) RETURNING id",
            Long.class,
            marketId,
            ownerId,
            name);
    return new StoreRow(id, marketId, ownerId, name);
  }

  public StoreRow lockStore(long id) {
    return jdbc
        .query(
            "SELECT * FROM stores WHERE id=? FOR UPDATE",
            (rs, n) ->
                new StoreRow(
                    rs.getLong("id"),
                    rs.getLong("market_id"),
                    rs.getLong("owner_account_id"),
                    rs.getString("name")),
            id)
        .stream()
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("매장을 찾을 수 없습니다."));
  }

  public void renameStore(long id, String name) {
    jdbc.update("UPDATE stores SET name=? WHERE id=?", name, id);
  }

  public java.util.List<java.util.Map<String, Object>> managedStores(String query, int page) {
    return jdbc.queryForList(
        "SELECT s.id,s.name,s.market_id AS \"marketId\",m.name AS \"marketName\",a.id AS \"ownerId\",a.login_id AS \"loginId\" FROM stores s JOIN markets m ON m.id=s.market_id JOIN accounts a ON a.id=s.owner_account_id WHERE position(lower(?) in lower(s.name))>0 OR position(lower(?) in lower(m.name))>0 OR position(lower(?) in lower(a.login_id))>0 ORDER BY s.id DESC LIMIT 51 OFFSET ?",
        query,
        query,
        query,
        page * 50);
  }

  @Transactional(readOnly = true)
  public List<MarketRow> markets() {
    return markets.findAll(org.springframework.data.domain.Sort.by("id")).stream()
        .map(MarketEntity::toRow)
        .toList();
  }

  @Transactional(readOnly = true)
  public Optional<StoreRow> find(long storeId) {
    return stores.findById(storeId).map(StoreEntity::toRow);
  }

  @Transactional(readOnly = true)
  public Optional<StoreRow> findByOwner(long ownerId) {
    return stores.findByOwnerAccountId(ownerId).map(StoreEntity::toRow);
  }

  @Transactional
  public StoreRow ensureDemoStore(long ownerId, String marketName, String storeName) {
    MarketEntity market =
        markets
            .findByName(marketName)
            .orElseGet(() -> markets.saveAndFlush(new MarketEntity(marketName)));
    Optional<StoreEntity> existing = stores.findByOwnerAccountId(ownerId);
    if (existing.isPresent()) {
      StoreRow row = existing.orElseThrow().toRow();
      if (row.marketId() != market.id() || !row.name().equals(storeName)) {
        throw new IllegalStateException("데모 매장이 기존 데이터와 충돌합니다.");
      }
      return row;
    }
    return stores.saveAndFlush(new StoreEntity(market.id(), ownerId, storeName)).toRow();
  }
}
