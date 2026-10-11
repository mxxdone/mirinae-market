package com.mirinae.market.modules.store.business;

final class StoreAccess {
  private StoreAccess() {}

  static boolean allowed(String role, long accountId, long ownerId) {
    return "SELLER".equals(role) && accountId == ownerId;
  }
}
