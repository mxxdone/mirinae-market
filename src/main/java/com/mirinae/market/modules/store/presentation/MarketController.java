package com.mirinae.market.modules.store.presentation;

import com.mirinae.market.modules.store.business.LocatedMarketView;
import com.mirinae.market.modules.store.business.MarketLocationService;
import com.mirinae.market.modules.store.business.RegionView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MarketController {
  private final MarketLocationService markets;

  public MarketController(MarketLocationService markets) {
    this.markets = markets;
  }

  @Operation(
      summary = "시장 목록·지역 검색·내 주변",
      description =
          "판매자 계정과 연결된 매장이 있는 시장만 반환합니다. provinceCode·regionCode·query는 선택입니다. latitude·longitude는 둘 다 입력하며 직선거리 10km 이내를 거리순으로 반환합니다. 위치 미등록 시장은 지역·내 주변 결과에서 제외합니다. 사용자 위치를 저장하지 않고 외부 지도에 의존하지 않습니다.")
  @SecurityRequirement(name = "sessionCookie")
  @ApiResponse(responseCode = "200", description = "ID순 시장 목록")
  @ApiResponse(responseCode = "401", description = "미로그인: UNAUTHENTICATED")
  @GetMapping("/api/markets")
  public List<LocatedMarketView> list(
      @RequestParam(required = false) String provinceCode,
      @RequestParam(required = false) String regionCode,
      @RequestParam(defaultValue = "") String query,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude) {
    return markets.publicMarkets(provinceCode, regionCode, query, latitude, longitude);
  }

  @Operation(
      summary = "시장 선택용 지역 기준표",
      description = "공식 지역 코드와 정식 명칭·명시적인 약칭을 제공합니다. 일반구가 있으면 시와 구를 함께 표시합니다.")
  @SecurityRequirement(name = "sessionCookie")
  @GetMapping("/api/market-regions")
  public List<RegionView> regions() {
    return markets.regions();
  }
}
