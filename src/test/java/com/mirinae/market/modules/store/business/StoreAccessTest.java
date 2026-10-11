package com.mirinae.market.modules.store.business;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StoreAccessTest {
  @Test
  void permitsOnlySellerWhoOwnsTheStore() {
    assertThat(StoreAccess.allowed("SELLER", 1, 1)).isTrue();
    assertThat(StoreAccess.allowed("BUYER", 1, 1)).isFalse();
    assertThat(StoreAccess.allowed("SELLER", 1, 2)).isFalse();
    assertThat(StoreAccess.allowed(null, 1, 1)).isFalse();
  }
}
