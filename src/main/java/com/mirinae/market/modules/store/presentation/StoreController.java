package com.mirinae.market.modules.store.presentation;

import com.mirinae.market.modules.store.business.StoreService;
import com.mirinae.market.modules.store.business.StoreView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.security.Principal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StoreController {
  private final StoreService stores;

  public StoreController(StoreService stores) {
    this.stores = stores;
  }

  @Operation(
      summary = "본인 매장 조회",
      description = "판매자 역할과 DB의 매장 소유자를 모두 검사합니다. 타인·존재하지 않는 매장의 정보는 반환하지 않습니다.")
  @ApiResponse(responseCode = "200", description = "본인 매장 정보")
  @ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
  @ApiResponse(responseCode = "403", description = "다른 역할·매장 소유권 없음: FORBIDDEN")
  @GetMapping("/api/seller/stores/{storeId}")
  public StoreView ownedStore(Principal principal, @PathVariable long storeId) {
    return stores.ownedStore(principal.getName(), storeId);
  }
}
