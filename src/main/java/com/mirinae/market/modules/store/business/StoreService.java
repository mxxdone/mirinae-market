package com.mirinae.market.modules.store.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.AccountView;
import com.mirinae.market.modules.store.data.StoreData;
import com.mirinae.market.modules.store.data.StoreRow;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class StoreService {
  private final StoreData data;
  private final AccountService accounts;

  public StoreService(StoreData data, AccountService accounts) {
    this.data = data;
    this.accounts = accounts;
  }

  public MarketView createMarket(String name) {
    var row = data.createMarket(name);
    return new MarketView(row.id(), row.name());
  }

  public MarketView lockMarket(long id) {
    var row = data.lockMarket(id);
    return new MarketView(row.id(), row.name());
  }

  public MarketView renameMarket(long id, String name) {
    var row = data.renameMarket(id, name);
    return new MarketView(row.id(), row.name());
  }

  public StoreView createStore(long marketId, long ownerId, String name) {
    data.lockMarket(marketId);
    return view(data.createStore(marketId, ownerId, name));
  }

  public StoreView lockStore(long id) {
    return view(data.lockStore(id));
  }

  public StoreView renameStore(long id, String name) {
    data.renameStore(id, name);
    return view(data.find(id).orElseThrow());
  }

  public java.util.List<java.util.Map<String, Object>> managedStores(String query, int page) {
    return data.managedStores(query, page);
  }

  public List<MarketView> markets() {
    return data.markets().stream().map(row -> new MarketView(row.id(), row.name())).toList();
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

  public StoreView currentStore(String loginId) {
    AccountView account = accounts.current(loginId);
    if (!"SELLER".equals(account.role())) {
      throw new StoreForbiddenException();
    }
    StoreRow row = data.findByOwner(account.id()).orElseThrow(StoreForbiddenException::new);
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
