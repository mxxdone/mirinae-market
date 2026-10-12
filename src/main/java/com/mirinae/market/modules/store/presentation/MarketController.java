package com.mirinae.market.modules.store.presentation;

import com.mirinae.market.modules.store.business.MarketView;
import com.mirinae.market.modules.store.business.StoreService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MarketController {
  private final StoreService stores;

  public MarketController(StoreService stores) {
    this.stores = stores;
  }

  @Operation(summary = "시장 목록", description = "로그인한 구매자·판매자가 검색 범위를 선택하는 시장 목록입니다.")
  @SecurityRequirement(name = "sessionCookie")
  @ApiResponse(responseCode = "200", description = "ID순 시장 목록")
  @ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
  @GetMapping("/api/markets")
  public List<MarketView> list() {
    return stores.markets();
  }
}
