package com.mirinae.market.modules.store.data;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "markets")
class MarketEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 100, unique = true)
  private String name;

  protected MarketEntity() {}

  MarketEntity(String name) {
    this.name = name;
  }

  MarketRow toRow() {
    return new MarketRow(id, name);
  }

  long id() {
    return id;
  }
}
