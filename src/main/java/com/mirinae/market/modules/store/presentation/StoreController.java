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

  @Operation(
      summary = "로그인한 판매자의 담당 매장 조회",
      description = "서버 세션의 판매자 계정으로 담당 매장을 찾습니다. 매장 번호 입력 없이 기존 매장 고유번호와 소유 관계를 사용합니다.")
  @ApiResponse(responseCode = "200", description = "담당 매장 정보: id, marketId, name")
  @ApiResponse(responseCode = "401", description = "미로그인·세션 만료: UNAUTHENTICATED")
  @ApiResponse(responseCode = "403", description = "판매자 역할 아님·담당 매장 없음: FORBIDDEN")
  @GetMapping("/api/seller/stores/me")
  public StoreView currentStore(Principal principal) {
    return stores.currentStore(principal.getName());
  }
}
