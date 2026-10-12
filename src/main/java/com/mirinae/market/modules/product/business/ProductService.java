package com.mirinae.market.modules.product.business;

import com.mirinae.market.modules.product.data.OfferRow;
import com.mirinae.market.modules.product.data.ProductData;
import com.mirinae.market.modules.product.data.ProductRow;
import com.mirinae.market.modules.store.business.StoreService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
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
    if (compositionChanged && data.hasOffers(productId)) {
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
        unit.amount());
  }

  public ProductPage products(String loginId, long storeId, int page, int size) {
    stores.ownedStore(loginId, storeId);
    ProductRules.page(page, size);
    List<ProductRow> rows = data.products(storeId, page * size, size + 1);
    return new ProductPage(
        rows.stream().limit(size).map(ProductService::productView).toList(),
        page,
        size,
        rows.size() > size);
  }

  @Transactional
  public PickupWindowView window(
      String loginId, long storeId, LocalDate date, LocalTime start, LocalTime end) {
    authorizeAndLock(loginId, storeId);
    OfferRules.date(date, clock);
    OfferRules.window(start, end);
    data.window(storeId, date, start, end);
    return new PickupWindowView(storeId, date, start, end);
  }

  @Transactional
  public OfferView offer(
      String loginId,
      long storeId,
      long productId,
      LocalDate date,
      Integer price,
      Integer quantity) {
    authorizeAndLock(loginId, storeId);
    OfferRules.date(date, clock);
    ProductRules.offer(price, quantity);
    data.product(storeId, productId).orElseThrow(ProductNotFoundException::new);
    if (!data.hasWindow(storeId, date)) {
      throw new ProductConflictException("PICKUP_WINDOW_REQUIRED", "해당 수령일의 매장 수령 시간을 먼저 등록해 주세요.");
    }
    long id = data.offer(storeId, productId, date, price, quantity);
    long marketId = stores.ownedStore(loginId, storeId).marketId();
    return offerView(data.detail(marketId, date, id).orElseThrow(ProductNotFoundException::new));
  }

  public OfferPage search(long marketId, String query, int page, int size) {
    ProductRules.page(page, size);
    List<OfferRow> rows =
        data.search(
            marketId, OfferRules.tomorrow(clock), ProductRules.query(query), page * size, size + 1);
    return new OfferPage(
        rows.stream().limit(size).map(ProductService::offerView).toList(),
        page,
        size,
        rows.size() > size);
  }

  public OfferView detail(long marketId, long offerId) {
    return offerView(
        data.detail(marketId, OfferRules.tomorrow(clock), offerId)
            .orElseThrow(ProductNotFoundException::new));
  }

  private void authorizeAndLock(String loginId, long storeId) {
    stores.ownedStore(loginId, storeId);
    // 같은 매장 변경을 직렬화하고 날짜 검사는 잠금을 얻은 뒤 수행한다.
    data.lockStore(storeId);
  }

  private static ProductView productView(ProductRow row) {
    return new ProductView(
        row.id(), row.storeId(), row.name(), row.description(), row.unitType(), row.unitAmount());
  }

  private static OfferView offerView(OfferRow row) {
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
        row.startTime(),
        row.endTime(),
        unit.kind() == SaleUnit.Kind.WEIGHT ? "100g" : "1개",
        ProductRules.comparisonPrice(row.priceWon(), unit));
  }
}
