package com.mirinae.market.modules.product.business;

import com.mirinae.market.modules.product.data.OfferRow;
import com.mirinae.market.modules.product.data.ProductData;
import com.mirinae.market.modules.product.data.ProductRow;
import com.mirinae.market.modules.store.business.StoreService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ProductService {
  private final ProductData data;
  private final StoreService stores;
  private final Clock clock;

  public ProductService(ProductData data, StoreService stores, Clock clock) {
    this.data = data;
    this.stores = stores;
    this.clock = clock;
  }

  public List<java.util.Map<String, Object>> managedSales(LocalDate date, String query, int page) {
    return data.managedSales(date, query, page);
  }

  @Transactional
  public ProductView create(
      String loginId, long storeId, String name, String description, String type, Integer amount) {
    authorizeAndLock(loginId, storeId);
    SaleUnit unit = ProductRules.unit(type, amount);
    return productView(
        data.create(
            storeId,
            ProductRules.name(name),
            ProductRules.description(description),
            unit.kind().name(),
            unit.amount()));
  }

  @Transactional
  public ProductView update(
      String loginId,
      long storeId,
      long productId,
      String name,
      String description,
      String type,
      Integer amount) {
    authorizeAndLock(loginId, storeId);
    ProductRow previous =
        data.product(storeId, productId).orElseThrow(ProductNotFoundException::new);
    String normalizedName = ProductRules.name(name);
    String normalizedDescription = ProductRules.description(description);
    SaleUnit unit = ProductRules.unit(type, amount);
    boolean compositionChanged =
        !previous.name().equals(normalizedName)
            || !previous.unitType().equals(unit.kind().name())
            || previous.unitAmount() != unit.amount();
    if (compositionChanged && previous.hasSales()) {
      throw new ProductConflictException(
          "PRODUCT_LOCKED", "판매 조건이 있는 상품의 이름·판매 구성 변경은 새 상품으로 등록해 주세요.");
    }
    data.update(
        storeId,
        productId,
        normalizedName,
        normalizedDescription,
        unit.kind().name(),
        unit.amount());
    return new ProductView(
        productId,
        storeId,
        normalizedName,
        normalizedDescription,
        unit.kind().name(),
        unit.amount(),
        previous.hasSales());
  }

  public ProductView product(String loginId, long storeId, long productId) {
    stores.ownedStore(loginId, storeId);
    return productView(data.product(storeId, productId).orElseThrow(ProductNotFoundException::new));
  }

  public ProductPage products(String loginId, long storeId, int page, int size) {
    stores.ownedStore(loginId, storeId);
    ProductRules.page(page, size);
    List<ProductRow> rows = data.products(storeId, page * size, size + 1);
    return new ProductPage(
        rows.stream().limit(size).map(ProductService::productView).toList(),
        page,
        size,
        rows.size() > size,
        data.productCount(storeId));
  }

  @Transactional
  public void archive(String loginId, long storeId, long productId) {
    authorizeAndLock(loginId, storeId);
    if (!data.hasProduct(storeId, productId)) {
      throw new ProductNotFoundException();
    }
    data.archive(storeId, productId);
  }

  @Transactional
  public PickupWindowView window(
      String loginId,
      long storeId,
      LocalDate date,
      LocalTime start,
      LocalTime end,
      LocalTime deadline) {
    authorizeAndLock(loginId, storeId);
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    OfferRules.date(date, current);
    OfferRules.window(start, end, deadline);
    data.findWindow(storeId, date)
        .ifPresent(previous -> OfferRules.open(previous.orderDeadline(), current));
    OfferRules.open(deadline, current);
    checkWindowChange(storeId, date, start, end, deadline);
    data.window(storeId, date, start, end, deadline);
    return new PickupWindowView(storeId, date, start, end, deadline);
  }

  @Transactional
  public OfferView offer(
      String loginId,
      long storeId,
      long productId,
      LocalDate date,
      Integer price,
      Integer quantity,
      Long inventoryVersion) {
    authorizeAndLock(loginId, storeId);
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    OfferRules.date(date, current);
    ProductRules.offer(price, quantity);
    data.product(storeId, productId).orElseThrow(ProductNotFoundException::new);
    var window =
        data.findWindow(storeId, date)
            .orElseThrow(
                () ->
                    new ProductConflictException(
                        "PICKUP_WINDOW_REQUIRED", "해당 수령일의 매장 수령 시간을 먼저 등록해 주세요."));
    OfferRules.open(window.orderDeadline(), current);
    checkInventoryVersion(storeId, productId, date, inventoryVersion);
    long id = data.offer(storeId, productId, date, price, quantity);
    long marketId = stores.ownedStore(loginId, storeId).marketId();
    return offerView(data.detail(marketId, date, id).orElseThrow(ProductNotFoundException::new));
  }

  public PickupWindowView window(String loginId, long storeId, LocalDate date) {
    stores.ownedStore(loginId, storeId);
    OfferRules.date(date, clock);
    var row =
        data.findWindow(storeId, date)
            .orElseThrow(() -> new ProductNotFoundException("해당 날짜의 매장 수령 시간을 아직 등록하지 않았습니다."));
    return new PickupWindowView(storeId, date, row.startTime(), row.endTime(), row.orderDeadline());
  }

  public SaleProductPage sales(String loginId, long storeId, LocalDate date, int page, int size) {
    stores.ownedStore(loginId, storeId);
    OfferRules.date(date, clock);
    ProductRules.page(page, size);
    var rows = data.saleProducts(storeId, date, page * size, size + 1);
    return new SaleProductPage(
        rows.stream()
            .limit(size)
            .map(
                row ->
                    new SaleProductView(
                        productView(row.product()),
                        row.selling(),
                        row.priceWon(),
                        row.onlineQuantity(),
                        row.inventoryVersion()))
            .toList(),
        page,
        size,
        rows.size() > size,
        data.productCount(storeId));
  }

  @Transactional
  public void applySales(
      String loginId,
      long storeId,
      LocalDate date,
      LocalTime start,
      LocalTime end,
      LocalTime deadline,
      List<SaleChange> changes) {
    authorizeAndLock(loginId, storeId);
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    OfferRules.date(date, current);
    OfferRules.window(start, end, deadline);
    data.findWindow(storeId, date)
        .ifPresent(previous -> OfferRules.open(previous.orderDeadline(), current));
    OfferRules.open(deadline, current);
    SaleBatchRules.validate(changes);
    var issues = new ArrayList<SaleIssue>();
    for (SaleChange change : changes) {
      if (data.product(storeId, change.productId()).isEmpty())
        issues.add(new SaleIssue(change.productId(), "상품이 없거나 삭제되었습니다. 본인 상품 목록을 확인해 주세요."));
    }
    if (!issues.isEmpty()) throw new SaleBatchException(issues);
    for (SaleChange change : changes)
      if (change.selling())
        checkInventoryVersion(storeId, change.productId(), date, change.inventoryVersion());
    checkWindowChange(storeId, date, start, end, deadline);
    data.window(storeId, date, start, end, deadline);
    for (SaleChange change : changes) {
      if (change.selling())
        data.offer(storeId, change.productId(), date, change.priceWon(), change.onlineQuantity());
      else data.stopOffer(storeId, change.productId(), date);
    }
  }

  public OfferPage search(long marketId, String query, int page, int size) {
    ProductRules.page(page, size);
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    String normalizedQuery = ProductRules.query(query);
    List<OfferRow> rows =
        data.search(
            marketId,
            OfferRules.today(current),
            OfferRules.now(current),
            normalizedQuery,
            page * size,
            size + 1);
    return new OfferPage(
        rows.stream().limit(size).map(ProductService::offerView).toList(),
        page,
        size,
        rows.size() > size,
        data.offerCount(
            marketId, OfferRules.today(current), OfferRules.now(current), normalizedQuery));
  }

  public OfferView detail(long marketId, long offerId) {
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    var row =
        data.detail(marketId, OfferRules.today(current), offerId)
            .orElseThrow(ProductNotFoundException::new);
    if (!OfferRules.now(current).isBefore(row.orderDeadline()))
      throw new ProductNotFoundException();
    return offerView(row);
  }

  private void checkInventoryVersion(long storeId, long productId, LocalDate date, Long expected) {
    InventoryRules.version(data.inventoryVersion(storeId, productId, date).orElse(null), expected);
  }

  private void checkWindowChange(
      long storeId, LocalDate date, LocalTime start, LocalTime end, LocalTime deadline) {
    if (data.windowLocked(storeId, date)) {
      var previous = data.findWindow(storeId, date).orElseThrow();
      if (!previous.startTime().equals(start)
          || !previous.endTime().equals(end)
          || !previous.orderDeadline().equals(deadline))
        throw new ProductConflictException(
            "PICKUP_WINDOW_LOCKED", "확정 주문이 있어 오늘 주문 마감·수령 시간을 변경할 수 없습니다.");
    }
  }

  private void authorizeAndLock(String loginId, long storeId) {
    stores.ownedStore(loginId, storeId);
    // 같은 매장 변경을 직렬화하고 날짜 검사는 잠금을 얻은 뒤 수행한다.
    data.lockStore(storeId);
  }

  private static ProductView productView(ProductRow row) {
    return new ProductView(
        row.id(),
        row.storeId(),
        row.name(),
        row.description(),
        row.unitType(),
        row.unitAmount(),
        row.hasSales());
  }

  static OfferView offerView(OfferRow row) {
    SaleUnit unit = ProductRules.unit(row.unitType(), row.unitAmount());
    return new OfferView(
        row.id(),
        row.productId(),
        row.marketId(),
        row.storeId(),
        row.storeName(),
        row.productName(),
        row.description(),
        row.unitType(),
        row.unitAmount(),
        row.pickupDate(),
        row.priceWon(),
        row.onlineQuantity(),
        row.inventoryVersion(),
        row.startTime(),
        row.endTime(),
        row.orderDeadline(),
        unit.kind() == SaleUnit.Kind.WEIGHT ? "100g" : "1개",
        ProductRules.comparisonPrice(row.priceWon(), unit));
  }
}
