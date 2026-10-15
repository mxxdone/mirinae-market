package com.mirinae.market.modules.checkout.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.data.CheckoutData;
import com.mirinae.market.modules.checkout.data.CheckoutRow;
import com.mirinae.market.modules.checkout.data.LineRow;
import com.mirinae.market.modules.checkout.data.OrderRow;
import com.mirinae.market.modules.product.business.InventoryService;
import com.mirinae.market.modules.product.business.ProductConflictException;
import com.mirinae.market.modules.product.business.ProductNotFoundException;
import com.mirinae.market.modules.product.business.PurchaseLine;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CheckoutTransactions {
  private final CheckoutData data;
  private final InventoryService inventory;
  private final AccountService accounts;
  private final Clock clock;

  public CheckoutTransactions(
      CheckoutData data, InventoryService inventory, AccountService accounts, Clock clock) {
    this.data = data;
    this.inventory = inventory;
    this.accounts = accounts;
    this.clock = clock;
  }

  private long buyer(String loginId) {
    var account = accounts.current(loginId);
    if (!account.role().equals("BUYER")) throw new AccessDeniedException("구매자만 주문할 수 있습니다.");
    return account.id();
  }

  @Transactional
  public CartView cart(String loginId) {
    long buyer = buyer(loginId);
    data.lockBuyer(buyer);
    return cartView(buyer);
  }

  private CartView cartView(long buyer) {
    var items =
        data.cart(buyer).stream()
            .map(
                line -> {
                  var item = inventory.describe(line.offerId());
                  var offer = item.offer();
                  return new CartItemView(
                      offer,
                      line.quantity(),
                      line.expectedPrice(),
                      item.available(),
                      offer.priceWon() != line.expectedPrice()
                          || !offer.startTime().equals(line.startTime())
                          || !offer.endTime().equals(line.endTime())
                          || !offer.orderDeadline().equals(line.orderDeadline()));
                })
            .toList();
    return new CartView(data.version(buyer), items);
  }

  private void editable(long buyer) {
    data.atVersion(buyer, data.version(buyer))
        .filter(row -> row.status().equals("PENDING"))
        .ifPresent(
            row -> {
              throw new CheckoutConflictException("CHECKOUT_PENDING", "진행 중인 결제 결과를 먼저 확인해 주세요.");
            });
  }

  @Transactional
  public CartView put(String loginId, long marketId, long offerId, Integer quantity) {
    int count = CheckoutRules.quantity(quantity);
    long buyer = buyer(loginId);
    data.lockBuyer(buyer);
    editable(buyer);
    var item = inventory.describe(offerId);
    var offer = item.offer();
    if (!item.available() || offer.marketId() != marketId)
      throw new CheckoutConflictException("OFFER_UNAVAILABLE", "오늘 판매 중인 같은 시장의 상품만 담을 수 있습니다.");
    var existing = data.cart(buyer);
    for (var line : existing) {
      var previous = inventory.describe(line.offerId()).offer();
      if (previous.marketId() != marketId || !previous.pickupDate().equals(offer.pickupDate()))
        throw new CheckoutConflictException("CART_SCOPE", "다른 시장·수령일 상품을 담으려면 기존 장바구니를 먼저 비워 주세요.");
    }
    if (existing.size() >= 100 && existing.stream().noneMatch(line -> line.offerId() == offerId))
      throw new IllegalArgumentException("장바구니는 상품 100개까지 담을 수 있습니다.");
    data.cartItem(
        buyer,
        new LineRow(
            offerId,
            count,
            offer.priceWon(),
            offer.startTime(),
            offer.endTime(),
            offer.orderDeadline()));
    data.advance(buyer);
    return cartView(buyer);
  }

  @Transactional
  public CartView remove(String loginId, long offerId) {
    long buyer = buyer(loginId);
    data.lockBuyer(buyer);
    editable(buyer);
    data.remove(buyer, offerId);
    data.advance(buyer);
    return cartView(buyer);
  }

  @Transactional
  public CartView clear(String loginId) {
    long buyer = buyer(loginId);
    data.lockBuyer(buyer);
    editable(buyer);
    data.clear(buyer);
    return cartView(buyer);
  }

  @Transactional
  public CheckoutAttempt prepare(String loginId, String key, Long version, String mode) {
    CheckoutRules.key(key);
    CheckoutRules.mode(mode);
    if (version == null || version < 0) throw new IllegalArgumentException("장바구니 버전을 확인해 주세요.");
    long buyer = buyer(loginId);
    data.lockBuyer(buyer);
    var previous = data.find(buyer, key);
    if (previous.isPresent()) {
      var row = previous.orElseThrow();
      if (row.cartVersion() != version || !row.mode().equals(mode))
        throw new CheckoutConflictException(
            "REQUEST_KEY_CONFLICT", "같은 결제 요청 키에 다른 내용을 사용할 수 없습니다.");
      return new CheckoutAttempt(view(row), false);
    }
    if (data.version(buyer) != version)
      throw new CheckoutConflictException("CART_CHANGED", "장바구니가 변경되었습니다. 다시 확인해 주세요.");
    if (data.atVersion(buyer, version).isPresent())
      throw new CheckoutConflictException("CHECKOUT_PENDING", "같은 장바구니의 결제 결과를 먼저 확인해 주세요.");
    var lines = data.cart(buyer);
    CheckoutRules.items(lines.stream().map(LineRow::offerId).toList());
    CheckoutRules.amount(
        lines.stream().map(LineRow::expectedPrice).toList(),
        lines.stream().map(LineRow::quantity).toList());
    var row = data.prepare(buyer, key, version, mode, clock.instant(), lines);
    return new CheckoutAttempt(view(row), mode.equals("LOST_RESPONSE"));
  }

  @Transactional
  public CheckoutView finish(long buyer, String key) {
    data.lockBuyer(buyer);
    var row = data.find(buyer, key).orElseThrow(ProductNotFoundException::new);
    if (!row.status().equals("PENDING") || clock.instant().isBefore(row.dueAt())) return view(row);
    if (row.mode().equals("FAIL")) {
      data.failed(row.id(), "PAYMENT_FAILED", "모의 결제가 실패했습니다. 재고와 주문은 변경하지 않았습니다.");
      data.advance(buyer);
      return view(data.find(buyer, key).orElseThrow());
    }
    var lines = data.items(row.id());
    List<com.mirinae.market.modules.product.business.OfferView> offers;
    try {
      offers =
          inventory.purchase(
              lines.stream()
                  .map(
                      line ->
                          new PurchaseLine(
                              line.offerId(),
                              line.quantity(),
                              line.expectedPrice(),
                              line.startTime(),
                              line.endTime(),
                              line.orderDeadline()))
                  .toList());
    } catch (ProductConflictException failure) {
      data.failed(row.id(), failure.code(), failure.getMessage());
      data.advance(buyer);
      return view(data.find(buyer, key).orElseThrow());
    } catch (ProductNotFoundException failure) {
      data.failed(row.id(), "OFFER_UNAVAILABLE", "장바구니 상품을 더 이상 주문할 수 없습니다.");
      data.advance(buyer);
      return view(data.find(buyer, key).orElseThrow());
    }
    long total =
        CheckoutRules.amount(
            offers.stream().map(offer -> offer.priceWon()).toList(),
            lines.stream().map(LineRow::quantity).toList());
    for (int i = 0; i < lines.size(); i++) {
      var offer = offers.get(i);
      long storeOrder =
          data.storeOrder(
              row.id(),
              offer.storeId(),
              offer.marketId(),
              offer.storeName(),
              offer.pickupDate(),
              offer.startTime(),
              offer.endTime(),
              offer.orderDeadline());
      data.orderItem(
          storeOrder,
          offer.id(),
          offer.productName(),
          offer.unitType(),
          offer.unitAmount(),
          offer.priceWon(),
          lines.get(i).quantity());
    }
    data.confirmed(row.id(), total, clock.instant());
    data.clear(buyer);
    return view(data.find(buyer, key).orElseThrow());
  }

  @Transactional(readOnly = true)
  public CheckoutView result(String loginId, String key) {
    return view(
        data.find(buyer(loginId), CheckoutRules.key(key))
            .orElseThrow(ProductNotFoundException::new));
  }

  @Transactional(readOnly = true)
  public List<CheckoutView> history(String loginId) {
    return data.history(buyer(loginId)).stream().map(this::view).toList();
  }

  @Transactional
  public void attempted(long id) {
    data.attempted(id);
  }

  @Transactional(readOnly = true)
  public List<CheckoutRow> due() {
    return data.due(clock.instant());
  }

  @Transactional(readOnly = true)
  public long buyerId(String loginId) {
    return buyer(loginId);
  }

  private CheckoutView view(CheckoutRow row) {
    List<OrderRow> orders = data.orders(row.id());
    var groups = new ArrayList<StoreOrderView>();
    for (long id : orders.stream().map(OrderRow::storeOrderId).distinct().toList()) {
      var group = orders.stream().filter(item -> item.storeOrderId() == id).toList();
      var first = group.getFirst();
      groups.add(
          new StoreOrderView(
              id,
              first.storeId(),
              first.storeName(),
              first.pickupDate(),
              first.startTime(),
              first.endTime(),
              first.orderDeadline(),
              group.stream()
                  .map(
                      item ->
                          new OrderItemView(
                              item.productName(),
                              item.unitType(),
                              item.unitAmount(),
                              item.priceWon(),
                              item.quantity()))
                  .toList()));
    }
    return new CheckoutView(
        row.id(),
        row.requestKey(),
        row.status(),
        row.errorCode(),
        row.message(),
        Long.toString(row.totalWon()),
        groups);
  }
}
