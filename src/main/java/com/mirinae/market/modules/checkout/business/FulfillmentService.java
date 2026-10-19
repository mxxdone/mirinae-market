package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.data.FulfillmentData;
import com.mirinae.market.modules.checkout.data.OrderItemRow;
import com.mirinae.market.modules.checkout.data.StoreOrderRow;
import com.mirinae.market.modules.product.business.InventoryService;
import com.mirinae.market.modules.product.business.ProductNotFoundException;
import com.mirinae.market.modules.store.business.StoreService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class FulfillmentService {
  private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
  private final FulfillmentData data;
  private final AccountService accounts;
  private final StoreService stores;
  private final InventoryService inventory;
  private final Clock clock;
  private final String refundMode;

  public FulfillmentService(
      FulfillmentData data,
      AccountService accounts,
      StoreService stores,
      InventoryService inventory,
      Clock clock,
      @Value("${mirinae.refund.mode:SUCCESS}") String refundMode) {
    this.data = data;
    this.accounts = accounts;
    this.stores = stores;
    this.inventory = inventory;
    this.clock = clock;
    if (!Set.of("SUCCESS", "TRANSIENT_FAILURE", "PERMANENT_FAILURE", "LOST_RESPONSE")
        .contains(refundMode)) throw new IllegalArgumentException("모의 환불 유형을 확인해 주세요.");
    this.refundMode = refundMode;
  }

  public List<StoreOrderView> checkoutOrders(long checkoutId) {
    return data.checkoutOrders(checkoutId).stream().map(id -> view(id, true)).toList();
  }

  public List<StoreOrderView> managedOrders(String actor, long checkoutId) {
    accounts.requireAdministrator(actor);
    return data.checkoutOrders(checkoutId).stream().map(id -> view(id, false)).toList();
  }

  public StoreOrderView buyerOrder(String actor, long id) {
    requireBuyer(actor, id);
    return view(id, true);
  }

  public StoreOrderView sellerOrder(String actor, long store, long id) {
    stores.ownedStore(actor, store);
    if (order(id).storeId() != store) throw new ProductNotFoundException();
    return view(id, false);
  }

  public StoreOrderPage sellerOrders(String actor, long store, LocalDate date, int page) {
    stores.ownedStore(actor, store);
    var ids =
        data.sellerOrders(
            store, date == null ? now().toLocalDate() : date, FulfillmentRules.page(page));
    return new StoreOrderPage(
        ids.stream().limit(50).map(id -> view(id, false)).toList(), page, ids.size() > 50);
  }

  @Transactional
  public StoreOrderView cancel(String actor, long id, String key, String kind) {
    long buyer = requireBuyer(actor, id);
    if (!Set.of("GENERAL", "REMAINDER").contains(kind == null ? "" : kind))
      throw new IllegalArgumentException("취소 종류를 확인해 주세요.");
    var row = locked(id);
    String fingerprint = "BUYER:" + id + ":" + kind;
    if (repeated(buyer, key, id, fingerprint)) return view(id, true);
    var items = data.items(id);
    boolean failure = hasFailure(items);
    if (!FulfillmentRules.canCancel(
        now(),
        row.pickupDate().atTime(row.orderDeadline()),
        end(row),
        row.pickedUpAt() != null,
        failure,
        hasRemaining(items),
        kind)) throw conflict("CANCELLATION_NOT_ALLOWED", "취소 가능한 시간·주문 상태가 아닙니다.");
    apply(
        row,
        buyer,
        key,
        fingerprint,
        kind,
        kind.equals("GENERAL") ? "구매자 일반 취소" : "판매 실패 후 나머지 취소",
        items.stream().filter(i -> i.cancelledAt() == null).toList(),
        kind.equals("GENERAL"));
    return view(id, true);
  }

  @Transactional
  public StoreOrderView failure(
      String actor, long store, long id, String key, List<Long> itemIds, String reason) {
    stores.ownedStore(actor, store);
    long seller = accounts.current(actor).id();
    String valid = FulfillmentRules.reason(reason);
    if (itemIds == null
        || itemIds.isEmpty()
        || itemIds.size() > 100
        || itemIds.stream().anyMatch(i -> i == null || i < 1)
        || itemIds.stream().distinct().count() != itemIds.size())
      throw new IllegalArgumentException("제공 불가 주문 항목을 중복 없이 선택해 주세요.");
    var row = locked(id);
    if (row.storeId() != store) throw new ProductNotFoundException();
    String fingerprint = "FAILURE:" + id + ":" + itemIds.stream().sorted().toList() + ":" + valid;
    if (repeated(seller, key, id, fingerprint)) return view(id, false);
    if (row.pickedUpAt() != null || !now().toLocalDate().equals(row.pickupDate()))
      throw conflict("FAILURE_NOT_ALLOWED", "판매 실패는 수령일 당일의 수령 전 주문에만 등록할 수 있습니다.");
    var selected = data.items(id).stream().filter(i -> itemIds.contains(i.id())).toList();
    if (selected.size() != itemIds.size())
      throw new IllegalArgumentException("해당 주문에 속한 항목을 선택해 주세요.");
    if (selected.stream().anyMatch(i -> i.cancelledAt() != null))
      throw conflict("ITEM_NOT_AVAILABLE", "선택 항목이 없거나 이미 취소되었습니다.");
    apply(row, seller, key, fingerprint, "FULFILLMENT_FAILURE", valid, selected, false);
    return view(id, false);
  }

  @Transactional
  public StoreOrderView pickup(String actor, long store, long id, String code) {
    stores.ownedStore(actor, store);
    var row = locked(id);
    if (row.storeId() != store) throw new ProductNotFoundException();
    if (code == null || !code.matches("[0-9]{6}") || !row.pickupCode().equals(code))
      throw conflict("INVALID_PICKUP_CODE", "수령 코드가 일치하지 않습니다.");
    if (row.pickedUpAt() != null) return view(id, false);
    if (!hasRemaining(data.items(id))
        || !FulfillmentRules.within(now(), row.pickupDate().atTime(row.startTime()), end(row)))
      throw conflict("PICKUP_NOT_ALLOWED", "수령 가능한 시간·주문 상태가 아닙니다.");
    data.pickup(id, clock.instant());
    return view(id, false);
  }

  @Transactional
  public OrderOperationResult adminCancel(
      String actor, long id, String key, String type, String reason) {
    accounts.requireAdministrator(actor);
    long admin = accounts.current(actor).id();
    String valid = FulfillmentRules.reason(reason);
    if (!Set.of("BUYER_REQUEST", "STORE_FAULT", "SERVICE_ERROR").contains(type == null ? "" : type))
      throw new IllegalArgumentException("관리자 취소 사유 종류를 확인해 주세요.");
    var row = locked(id);
    String fingerprint = "ADMIN:" + id + ":" + type + ":" + valid;
    if (repeated(admin, key, id, fingerprint))
      return new OrderOperationResult(view(id, false), false);
    var remaining = data.items(id).stream().filter(i -> i.cancelledAt() == null).toList();
    if (row.pickedUpAt() != null
        || remaining.isEmpty()
        || (type.equals("BUYER_REQUEST")
            && !now().isBefore(row.pickupDate().atTime(row.orderDeadline()))))
      throw conflict("CANCELLATION_NOT_ALLOWED", "수령 완료·전체 취소 주문 또는 허용되지 않은 취소 시점입니다.");
    apply(row, admin, key, fingerprint, type, valid, remaining, type.equals("BUYER_REQUEST"));
    return new OrderOperationResult(view(id, false), true);
  }

  private void apply(
      StoreOrderRow row,
      long actor,
      String key,
      String fingerprint,
      String type,
      String reason,
      List<OrderItemRow> items,
      boolean restore) {
    long operation =
        data.operation(actor, FulfillmentRules.key(key), row.id(), fingerprint, clock.instant());
    long amount = 0;
    for (var item : items) {
      data.cancel(item.id(), actor, type, reason, clock.instant());
      amount = Math.addExact(amount, Math.multiplyExact((long) item.priceWon(), item.quantity()));
      if (restore) inventory.restore(item.offerId(), item.quantity());
    }
    data.refund(operation, row.id(), amount, refundMode, clock.instant());
  }

  private boolean repeated(long actor, String key, long id, String fingerprint) {
    var old = data.operation(actor, FulfillmentRules.key(key));
    if (old.isEmpty()) return false;
    if (old.orElseThrow().storeOrderId() != id
        || !old.orElseThrow().fingerprint().equals(fingerprint))
      throw conflict("REQUEST_KEY_CONFLICT", "같은 요청 키에 다른 작업을 사용할 수 없습니다.");
    return true;
  }

  private long requireBuyer(String actor, long id) {
    var account = accounts.current(actor);
    if (!account.role().equals("BUYER")) throw new AccessDeniedException("구매자 권한이 필요합니다.");
    if (order(id).buyerId() != account.id()) throw new ProductNotFoundException();
    return account.id();
  }

  private StoreOrderRow locked(long id) {
    var row = order(id);
    stores.lockStore(row.storeId());
    data.lockOrder(id);
    return order(id);
  }

  private StoreOrderRow order(long id) {
    return data.order(id).orElseThrow(ProductNotFoundException::new);
  }

  private LocalDateTime now() {
    return LocalDateTime.ofInstant(clock.instant(), ZONE);
  }

  private static LocalDateTime end(StoreOrderRow row) {
    return row.pickupDate().atTime(row.endTime());
  }

  private static boolean hasRemaining(List<OrderItemRow> items) {
    return items.stream().anyMatch(i -> i.cancelledAt() == null);
  }

  private static boolean hasFailure(List<OrderItemRow> items) {
    return items.stream().anyMatch(i -> "FULFILLMENT_FAILURE".equals(i.cancellationType()));
  }

  private static CheckoutConflictException conflict(String code, String message) {
    return new CheckoutConflictException(code, message);
  }

  private StoreOrderView view(long id, boolean buyer) {
    var row = order(id);
    var items = data.items(id);
    var refunds = data.refunds(id);
    boolean remaining = hasRemaining(items),
        failure = hasFailure(items),
        pickedUp = row.pickedUpAt() != null;
    var current = now();
    return new StoreOrderView(
        id,
        row.storeId(),
        row.storeName(),
        row.pickupDate(),
        row.startTime(),
        row.endTime(),
        row.orderDeadline(),
        items.stream()
            .map(
                i ->
                    new OrderItemView(
                        i.id(),
                        i.productName(),
                        i.unitType(),
                        i.unitAmount(),
                        i.priceWon(),
                        i.quantity(),
                        i.cancelledAt() != null,
                        i.cancellationType(),
                        i.cancellationReason()))
            .toList(),
        FulfillmentRules.status(current, end(row), pickedUp, remaining),
        buyer ? row.pickupCode() : null,
        failure,
        FulfillmentRules.canCancel(
            current,
            row.pickupDate().atTime(row.orderDeadline()),
            end(row),
            pickedUp,
            failure,
            remaining,
            "GENERAL"),
        FulfillmentRules.canCancel(
            current,
            row.pickupDate().atTime(row.orderDeadline()),
            end(row),
            pickedUp,
            failure,
            remaining,
            "REMAINDER"),
        Long.toString(refunds.stream().mapToLong(r -> r.amountWon()).sum()),
        Long.toString(
            refunds.stream()
                .filter(r -> r.status().equals("COMPLETED"))
                .mapToLong(r -> r.amountWon())
                .sum()),
        refunds.stream().map(RefundService::view).toList());
  }
}
