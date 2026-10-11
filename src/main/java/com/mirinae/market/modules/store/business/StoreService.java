package com.mirinae.market.modules.store.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import com.mirinae.market.modules.store.data.StoreData;
import com.mirinae.market.modules.store.data.StoreRow;
import org.springframework.stereotype.Service;

@Service
public class StoreService {
  private final StoreData data;
  private final AccountService accounts;

  public StoreService(StoreData data, AccountService accounts) {
    this.data = data;
    this.accounts = accounts;
  }

  public StoreView ownedStore(String loginId, long storeId) {
    AccountView account = accounts.current(loginId);
    if (!"SELLER".equals(account.role())) {
      throw new StoreForbiddenException();
    }
    StoreRow row = data.find(storeId).orElseThrow(StoreForbiddenException::new);
    if (!StoreAccess.allowed(account.role(), account.id(), row.ownerAccountId())) {
      throw new StoreForbiddenException();
    }
    return view(row);
  }

  public StoreView ensureDemoStore(String ownerLoginId, String marketName, String storeName) {
    AccountView owner = accounts.current(ownerLoginId);
    if (!"SELLER".equals(owner.role())) {
      throw new StoreForbiddenException();
    }
    return view(data.ensureDemoStore(owner.id(), marketName, storeName));
  }

  private static StoreView view(StoreRow row) {
    return new StoreView(row.id(), row.marketId(), row.name());
  }
}
