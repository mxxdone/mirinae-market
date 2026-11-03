package com.mirinae.market.modules.store.business;

import com.mirinae.market.modules.store.data.LocatedMarketRow;
import com.mirinae.market.modules.store.data.MarketLocationData;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class MarketLocationService {
  private final MarketLocationData data;

  public MarketLocationService(MarketLocationData data) {
    this.data = data;
  }

  public List<RegionView> regions() {
    return data.regions().stream()
        .map(
            r ->
                new RegionView(
                    r.code(),
                    r.provinceCode(),
                    r.provinceName(),
                    r.provinceShortName(),
                    r.districtName()))
        .toList();
  }

  public List<LocatedMarketView> managedMarkets() {
    return data.markets(false).stream().map(r -> view(r, null)).toList();
  }

  public List<LocatedMarketView> publicMarkets(
      String province, String region, String query, Double latitude, Double longitude) {
    boolean nearby = latitude != null || longitude != null;
    if (nearby) MarketLocationRules.coordinates(latitude, longitude);
    if (region != null) requireRegion(region);
    if (province != null && regions().stream().noneMatch(r -> r.provinceCode().equals(province))) {
      throw new IllegalArgumentException("시도 선택을 확인해 주세요.");
    }
    if (query == null || query.length() > 100 || query.chars().anyMatch(Character::isISOControl)) {
      throw new IllegalArgumentException("시장 검색어는 100자 이하여야 합니다.");
    }
    String search = query.strip().toLowerCase(java.util.Locale.ROOT);
    var result =
        data.markets(true).stream()
            .filter(r -> province == null || province.equals(r.provinceCode()))
            .filter(r -> region == null || region.equals(r.regionCode()))
            .filter(r -> r.name().toLowerCase(java.util.Locale.ROOT).contains(search))
            .filter(
                r ->
                    !nearby
                        || r.latitude() != null
                            && MarketLocationRules.nearby(
                                latitude, longitude, r.latitude(), r.longitude()))
            .map(
                r ->
                    view(
                        r,
                        nearby
                            ? MarketLocationRules.distance(
                                latitude, longitude, r.latitude(), r.longitude())
                            : null));
    if (nearby)
      result =
          result.sorted(
              Comparator.comparing(LocatedMarketView::distanceKm)
                  .thenComparing(LocatedMarketView::id));
    return result.toList();
  }

  public List<MarketCandidateView> candidates(
      String query, int page, String province, String region) {
    if (query == null || query.length() > 100 || page < 0 || page > 100000) {
      throw new IllegalArgumentException("후보 검색어·페이지 범위를 확인해 주세요.");
    }
    if (region != null) requireRegion(region);
    if (province != null && regions().stream().noneMatch(r -> r.provinceCode().equals(province))) {
      throw new IllegalArgumentException("시도를 선택해 주세요.");
    }
    if (province != null && region != null && !region.startsWith(province)) {
      throw new IllegalArgumentException("선택한 시도에 속하는 시군구를 선택해 주세요.");
    }
    return data.candidates(query.strip(), page, province, region).stream()
        .map(
            r ->
                new MarketCandidateView(
                    r.id(),
                    r.name(),
                    r.regionCode(),
                    r.address(),
                    r.latitude(),
                    r.longitude(),
                    r.sourceDate()))
        .toList();
  }

  @Transactional
  public LocatedMarketView create(String name, MarketLocation location) {
    MarketLocation valid = validate(location);
    long id =
        data.create(name, valid.regionCode(), valid.address(), valid.latitude(), valid.longitude());
    return view(data.find(id), null);
  }

  public LocatedMarketView find(long id) {
    return view(data.find(id), null);
  }

  @Transactional
  public LocatedMarketView lock(long id) {
    data.lock(id);
    return find(id);
  }

  @Transactional
  public LocatedMarketView update(long id, String name, MarketLocation location) {
    data.lock(id);
    var before = data.find(id);
    boolean omitted =
        location.regionCode() == null
            && location.address() == null
            && location.latitude() == null
            && location.longitude() == null;
    MarketLocation valid =
        omitted
            ? new MarketLocation(
                before.regionCode(), before.address(), before.latitude(), before.longitude())
            : validate(location);
    data.update(id, name, valid.regionCode(), valid.address(), valid.latitude(), valid.longitude());
    return find(id);
  }

  private MarketLocation validate(MarketLocation location) {
    if (location == null) throw new IllegalArgumentException("시장 위치 정보를 입력해 주세요.");
    String region = MarketLocationRules.region(location.regionCode());
    requireRegion(region);
    MarketLocationRules.coordinates(location.latitude(), location.longitude());
    return new MarketLocation(
        region,
        MarketLocationRules.address(location.address()),
        location.latitude(),
        location.longitude());
  }

  private void requireRegion(String region) {
    MarketLocationRules.region(region);
    if (!data.regionExists(region)) throw new IllegalArgumentException("등록된 시군구를 선택해 주세요.");
  }

  private static LocatedMarketView view(LocatedMarketRow row, Double distance) {
    return new LocatedMarketView(
        row.id(),
        row.name(),
        row.regionCode(),
        row.provinceCode(),
        row.regionLabel(),
        row.address(),
        row.latitude(),
        row.longitude(),
        distance);
  }
}
