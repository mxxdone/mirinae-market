package com.mirinae.market.modules.product.business;

import java.util.ArrayList;
import java.util.List;

public class SaleBatchException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final ArrayList<SaleIssue> issues;

  public SaleBatchException(List<SaleIssue> issues) {
    super("입력을 확인해 주세요. 모든 변경을 적용하지 않았습니다.");
    this.issues = new ArrayList<>(issues);
  }

  public List<SaleIssue> issues() {
    return List.copyOf(issues);
  }
}
