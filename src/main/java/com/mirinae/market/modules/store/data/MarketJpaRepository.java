package com.mirinae.market.modules.store.data;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface MarketJpaRepository extends JpaRepository<MarketEntity, Long> {
  Optional<MarketEntity> findByName(String name);
}
