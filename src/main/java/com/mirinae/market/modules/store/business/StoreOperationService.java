package com.mirinae.market.modules.store.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.store.data.StoreOperationData;
import com.mirinae.market.modules.store.data.StoreReportRow;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StoreOperationService {
  private final StoreService stores;
  private final AccountService accounts;
  private final StoreOperationData data;
  private final Clock clock;

  public StoreOperationService(
      StoreService stores, AccountService accounts, StoreOperationData data, Clock clock) {
    this.stores = stores;
    this.accounts = accounts;
    this.data = data;
    this.clock = clock;
  }

  private long buyer(String actor) {
    var account = accounts.current(actor);
    if (!account.role().equals("BUYER")) throw new AccessDeniedException("구매자만 매장을 제보할 수 있습니다.");
    return account.id();
  }

  @Transactional
  public StoreReportView report(String actor, long store, String type, String description) {
    long buyer = buyer(actor);
    String validType = StoreReportRules.type(type),
        validDescription = StoreReportRules.text(description);
    if (!data.exists(store)) throw new StoreNotFoundException();
    stores.lockStore(store);
    return view(
        data.report(data.report(store, buyer, validType, validDescription, clock.instant()))
            .orElseThrow());
  }

  public List<StoreReportView> own(String actor, long store) {
    return data.ownReports(store, buyer(actor)).stream().map(StoreOperationService::view).toList();
  }

  public List<ManagedStoreReportView> managed(String actor, String status, int page) {
    accounts.requireAdministrator(actor);
    if (!Set.of("", "OPEN", "REVIEWING", "RESOLVED").contains(status))
      throw new IllegalArgumentException("제보 상태를 확인해 주세요.");
    return data.managedReports(status, StoreReportRules.page(page)).stream()
        .map(
            r ->
                new ManagedStoreReportView(
                    view(r),
                    r.buyerLoginId(),
                    r.contactName(),
                    r.contactPhone(),
                    r.email(),
                    r.unresolvedClosureCount(),
                    r.unresolvedClosureCount() >= 3))
        .toList();
  }

  @Transactional
  public StoreReportView resolve(String actor, long id, String status, String resolution) {
    accounts.requireAdministrator(actor);
    var before = data.report(id).orElseThrow(StoreNotFoundException::new);
    stores.lockStore(before.storeId());
    data.lockReport(id);
    var row = data.report(id).orElseThrow();
    if (row.status().equals(status)) return null;
    if (!StoreReportRules.transition(row.status(), status))
      throw new StoreOperationConflictException();
    String note = "RESOLVED".equals(status) ? StoreReportRules.text(resolution) : null;
    data.resolve(id, status, note, accounts.current(actor).id(), clock.instant());
    return view(row);
  }

  @Transactional
  public boolean operation(String actor, long store, boolean suspended, String reason) {
    accounts.requireAdministrator(actor);
    String valid = StoreReportRules.text(reason);
    if (!data.exists(store)) throw new StoreNotFoundException();
    stores.lockStore(store);
    if (data.suspended(store) == suspended) return false;
    data.operation(store, suspended, accounts.current(actor).id(), valid, clock.instant());
    return true;
  }

  private static StoreReportView view(StoreReportRow row) {
    return new StoreReportView(
        row.id(),
        row.storeId(),
        row.storeName(),
        row.type(),
        row.description(),
        row.status(),
        row.resolution(),
        row.createdAt(),
        row.updatedAt());
  }
}
