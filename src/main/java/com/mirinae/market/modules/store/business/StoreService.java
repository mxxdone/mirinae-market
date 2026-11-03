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

  @org.springframework.transaction.annotation.Transactional(
      readOnly = true,
      isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public StorePage publicStores(long marketId, String query, int page, int size) {
    if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("페이지는 0 이상, 크기는 1~100이어야 합니다.");
    }
    String text = query == null ? "" : query.strip();
    if (text.codePointCount(0, text.length()) > 100 || text.indexOf('\0') >= 0) {
      throw new IllegalArgumentException("검색어는 최대 100자로 입력해 주세요.");
    }
    var rows = data.publicStores(marketId, text, page * size, size + 1);
    return new StorePage(
        rows.stream().limit(size).map(StoreService::view).toList(),
        page,
        size,
        rows.size() > size,
        data.publicStoreCount(marketId, text));
  }

  @org.springframework.transaction.annotation.Transactional(readOnly = true)
  public StoreView publicStore(long marketId, long storeId) {
    return view(data.publicStore(marketId, storeId).orElseThrow(StoreNotFoundException::new));
  }

  public List<Long> publicStoreIds(long marketId, List<Long> ids) {
    if (ids == null
        || ids.isEmpty()
        || ids.size() > 100
        || ids.stream().anyMatch(id -> id == null || id < 1)) {
      throw new IllegalArgumentException("매장 ID는 양수 1~100개여야 합니다.");
    }
    return data.publicStoreIds(marketId, ids);
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
