package com.mirinae.market.modules.product.business;

public record SaleIssue(Long productId, String message) implements java.io.Serializable {
  private static final long serialVersionUID = 1L;
}
