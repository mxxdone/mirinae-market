package com.mirinae.market.modules.product.business;

public record SaleChange(
    Long productId,
    Boolean selling,
    Integer priceWon,
    Integer onlineQuantity,
    Long inventoryVersion) {
  public SaleChange(Long productId, Boolean selling, Integer priceWon, Integer onlineQuantity) {
    this(productId, selling, priceWon, onlineQuantity, null);
  }
}
