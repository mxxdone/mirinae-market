package com.mirinae.market.modules.store.data;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "stores")
class StoreEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "market_id", nullable = false)
  private long marketId;

  @Column(name = "owner_account_id", nullable = false, unique = true)
  private long ownerAccountId;

  @Column(nullable = false, length = 100)
  private String name;

  protected StoreEntity() {}

  StoreEntity(long marketId, long ownerAccountId, String name) {
    this.marketId = marketId;
    this.ownerAccountId = ownerAccountId;
    this.name = name;
  }

  StoreRow toRow() {
    return new StoreRow(id, marketId, ownerAccountId, name);
  }
}
