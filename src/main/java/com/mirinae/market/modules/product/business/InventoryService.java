package com.mirinae.market.modules.product.business;

import com.mirinae.market.modules.product.data.ProductData;
import java.time.Clock;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryService {
  private final ProductData data;
  private final Clock clock;

  public InventoryService(ProductData data, Clock clock) {
    this.data = data;
    this.clock = clock;
  }

  public InventoryOffer describe(long id) {
    var row = data.checkoutOffer(id).orElseThrow(ProductNotFoundException::new);
    var offer = ProductService.offerView(row.offer());
    return new InventoryOffer(
        offer,
        row.active()
            && !row.suspended()
            && !row.archived()
            && offer.pickupDate().equals(OfferRules.today(clock))
            && OfferRules.now(clock).isBefore(offer.orderDeadline()));
  }

  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
  public void restore(long id, int quantity) {
    var offer = describe(id);
    data.lockStore(offer.offer().storeId());
    var current = describe(id);
    if (current.available()) {
      if ((long) current.offer().onlineQuantity() + quantity > Integer.MAX_VALUE)
        throw new ProductConflictException(
            "INVENTORY_RESTORE_OVERFLOW", "반환 후 온라인 수량이 저장 상한을 넘습니다. 판매자 수량 확인 후 취소를 다시 요청해 주세요.");
      data.restore(id, quantity);
    }
  }

  @Transactional(
      propagation = org.springframework.transaction.annotation.Propagation.MANDATORY,
      noRollbackFor = {ProductConflictException.class, ProductNotFoundException.class})
  public List<OfferView> purchase(List<PurchaseLine> lines) {
    var before = lines.stream().map(line -> describe(line.offerId()).offer()).toList();
    before.stream().map(OfferView::storeId).distinct().sorted().forEach(data::lockStore);
    Clock current = Clock.fixed(clock.instant(), clock.getZone());
    var offers = lines.stream().map(line -> describe(line.offerId())).toList();
    long market = offers.getFirst().offer().marketId();
    for (int i = 0; i < lines.size(); i++) {
      var line = lines.get(i);
      var item = offers.get(i);
      var offer = item.offer();
      if (!item.available()
          || offer.marketId() != market
          || !offer.pickupDate().equals(OfferRules.today(current))
          || !OfferRules.now(current).isBefore(offer.orderDeadline()))
        throw new ProductConflictException(
            "OFFER_UNAVAILABLE",
            offer.storeName() + " · " + offer.productName() + ": 판매 중단·삭제·마감 또는 수령일 경과입니다.");
      if (offer.priceWon() != line.expectedPrice()
          || !offer.startTime().equals(line.startTime())
          || !offer.endTime().equals(line.endTime())
          || !offer.orderDeadline().equals(line.orderDeadline()))
        throw new ProductConflictException(
            "CONDITIONS_CHANGED",
            offer.storeName()
                + " · "
                + offer.productName()
                + ": 가격·수령 시간이 변경되었습니다. 장바구니에서 다시 확인해 주세요.");
      if (offer.onlineQuantity() < line.quantity())
        throw new ProductConflictException(
            "OUT_OF_STOCK",
            offer.storeName() + " · " + offer.productName() + ": 다른 구매자가 먼저 구매했거나 재고가 부족합니다.");
    }
    for (int i = 0; i < lines.size(); i++) {
      var offer = offers.get(i).offer();
      data.consume(offer.id(), lines.get(i).quantity());
      data.lockWindow(offer.storeId(), offer.pickupDate());
    }
    return offers.stream().map(InventoryOffer::offer).toList();
  }
}
