package com.mirinae.market.modules.store.data;

import java.util.Optional;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class StoreData {
  private final StoreJpaRepository stores;
  private final MarketJpaRepository markets;

  StoreData(StoreJpaRepository stores, MarketJpaRepository markets) {
    this.stores = stores;
    this.markets = markets;
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
