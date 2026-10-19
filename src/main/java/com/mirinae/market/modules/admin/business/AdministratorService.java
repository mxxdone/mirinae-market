package com.mirinae.market.modules.admin.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.account.business.MemberView;
import com.mirinae.market.modules.admin.data.AdministratorData;
import com.mirinae.market.modules.checkout.business.CheckoutService;
import com.mirinae.market.modules.product.business.ProductService;
import com.mirinae.market.modules.store.business.LocatedMarketView;
import com.mirinae.market.modules.store.business.MarketLocation;
import com.mirinae.market.modules.store.business.MarketLocationService;
import com.mirinae.market.modules.store.business.StoreService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AdministratorService {
  private static final java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("Asia/Seoul");
  private final AccountService accounts;
  private final StoreService stores;
  private final ProductService products;
  private final CheckoutService checkouts;
  private final AdministratorData data;
  private final Clock clock;
  private final MarketLocationService locations;
  private final com.mirinae.market.modules.checkout.business.FulfillmentService fulfillment;
  private final com.mirinae.market.modules.checkout.business.RefundService refunds;
  private final com.mirinae.market.modules.store.business.StoreOperationService operations;

  public AdministratorService(
      AccountService accounts,
      StoreService stores,
      ProductService products,
      CheckoutService checkouts,
      AdministratorData data,
      Clock clock,
      MarketLocationService locations,
      com.mirinae.market.modules.checkout.business.FulfillmentService fulfillment,
      com.mirinae.market.modules.checkout.business.RefundService refunds,
      com.mirinae.market.modules.store.business.StoreOperationService operations) {
    this.accounts = accounts;
    this.stores = stores;
    this.products = products;
    this.checkouts = checkouts;
    this.data = data;
    this.clock = clock;
    this.locations = locations;
    this.fulfillment = fulfillment;
    this.refunds = refunds;
    this.operations = operations;
  }

  public List<AdminManagedReportView> reports(String actor, String status, int page) {
    return operations.managed(actor, status, page).stream()
        .map(AdminManagedReportView::from)
        .toList();
  }

  @Transactional
  public void resolveReport(String actor, long id, String status, String resolution) {
    accounts.requireAdministrator(actor);
    var before = operations.resolve(actor, id, status, resolution);
    if (before != null)
      record(
          actor,
          "STORE_REPORT",
          id,
          before.status() + ": " + (before.resolution() == null ? "" : before.resolution()),
          status + ": " + (resolution == null ? "" : resolution));
  }

  @Transactional
  public void operation(String actor, long id, boolean suspended, String reason) {
    accounts.requireAdministrator(actor);
    if (operations.operation(actor, id, suspended, reason))
      record(
          actor,
          "STORE",
          id,
          suspended ? "운영" : "운영 중지",
          (suspended ? "운영 중지: " : "운영 재개: ") + reason.strip());
  }

  public List<AdminStoreOrderView> managedStoreOrders(String actor, long checkoutId) {
    accounts.requireAdministrator(actor);
    return fulfillment.managedOrders(actor, checkoutId).stream()
        .map(AdminStoreOrderView::from)
        .toList();
  }

  @Transactional
  public AdminStoreOrderView cancelOrder(
      String actor, long id, String key, String type, String reason) {
    accounts.requireAdministrator(actor);
    var result = fulfillment.adminCancel(actor, id, key, type, reason);
    if (result.changed()) record(actor, "STORE_ORDER", id, "유효 주문", type + ": " + reason.strip());
    return AdminStoreOrderView.from(result.order());
  }

  public List<AdminRefundView> refunds(String actor, int page) {
    return refunds.list(actor, page).stream().map(AdminRefundView::from).toList();
  }

  @Transactional
  public void retryRefund(String actor, long id) {
    accounts.requireAdministrator(actor);
    if (refunds.retry(actor, id)) record(actor, "REFUND", id, "관리자 확인 필요", "모의 장애 해소 후 재처리 요청");
  }

  public List<AdminMarketView> markets(String actor) {
    accounts.requireAdministrator(actor);
    return locations.managedMarkets().stream().map(AdminMarketView::from).toList();
  }

  public List<AdminMarketCandidateView> candidates(
      String actor, String query, int page, String province, String region) {
    accounts.requireAdministrator(actor);
    return locations.candidates(query, page, province, region).stream()
        .map(AdminMarketCandidateView::from)
        .toList();
  }

  public List<Map<String, Object>> stores(String actor, String query, int page) {
    accounts.requireAdministrator(actor);
    return stores.managedStores(query, AdminRules.page(page));
  }

  public List<AdminMemberView> members(String actor, String role, String query, int page) {
    accounts.requireAdministrator(actor);
    return accounts.managedMembers(role, query, AdminRules.page(page)).stream()
        .map(AdministratorService::member)
        .toList();
  }

  public List<Map<String, Object>> sales(String actor, LocalDate date, String query, int page) {
    accounts.requireAdministrator(actor);
    return products.managedSales(
        date == null ? LocalDate.now(clock.withZone(BUSINESS_ZONE)) : date,
        query,
        AdminRules.page(page));
  }

  public List<Map<String, Object>> orders(String actor, String query, int page) {
    accounts.requireAdministrator(actor);
    return checkouts.managedOrders(query, AdminRules.page(page));
  }

  public List<Map<String, Object>> orderItems(String actor, long id) {
    accounts.requireAdministrator(actor);
    return checkouts.managedOrderItems(id);
  }

  public List<Map<String, Object>> history(
      String actor, String type, Long targetId, LocalDate from, LocalDate until, int page) {
    accounts.requireAdministrator(actor);
    if (!java.util.Set.of("", "MARKET", "STORE", "SELLER", "STORE_ORDER", "REFUND", "STORE_REPORT")
        .contains(type)) throw new IllegalArgumentException("이력 대상을 확인해 주세요.");
    if (targetId != null && targetId < 1) throw new IllegalArgumentException("대상 번호는 양수여야 합니다.");
    LocalDate start = from == null ? LocalDate.of(2000, 1, 1) : from;
    LocalDate end = until == null ? LocalDate.now(clock.withZone(BUSINESS_ZONE)) : until;
    if (end.isBefore(start)) throw new IllegalArgumentException("종료일은 시작일보다 빠를 수 없습니다.");
    return data.history(
        type,
        targetId,
        start.atStartOfDay(BUSINESS_ZONE).toInstant(),
        end.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant(),
        AdminRules.page(page));
  }

  @Transactional
  public AdminMarketView createMarket(String actor, AdminMarketInput input) {
    accounts.requireAdministrator(actor);
    var created = locations.create(AdminRules.name(input.name()), location(input));
    record(actor, "MARKET", created.id(), "", marketSummary(created));
    return AdminMarketView.from(created);
  }

  @Transactional
  public AdminMarketView updateMarket(String actor, long id, AdminMarketInput input) {
    accounts.requireAdministrator(actor);
    String valid = AdminRules.name(input.name());
    var before = locations.lock(id);
    var after = locations.update(id, valid, location(input));
    record(actor, "MARKET", id, marketSummary(before), marketSummary(after));
    return AdminMarketView.from(after);
  }

  @Transactional
  public AdminStoreView register(
      String actor,
      long marketId,
      String storeName,
      String loginId,
      String password,
      String email,
      String contactName,
      String contactPhone) {
    accounts.requireAdministrator(actor);
    String name = AdminRules.name(storeName),
        contact = AdminRules.name(contactName),
        phone = AdminRules.phone(contactPhone);
    stores.lockMarket(marketId);
    var seller = accounts.registerSeller(loginId, password, email, contact, phone);
    var store = stores.createStore(marketId, seller.id(), name);
    record(actor, "SELLER", seller.id(), "", contactSummary(seller));
    record(
        actor,
        "STORE",
        store.id(),
        "",
        "이름: "
            + store.name()
            + "\n소속 시장 번호: "
            + store.marketId()
            + "\n판매자 ID: "
            + seller.loginId());
    return new AdminStoreView(store.id(), store.marketId(), store.name());
  }

  @Transactional
  public AdminStoreView renameStore(String actor, long id, String name) {
    accounts.requireAdministrator(actor);
    String valid = AdminRules.name(name);
    var before = stores.lockStore(id);
    var after = stores.renameStore(id, valid);
    record(actor, "STORE", id, "이름: " + before.name(), "이름: " + after.name());
    return new AdminStoreView(after.id(), after.marketId(), after.name());
  }

  @Transactional
  public AdminMemberView contact(String actor, long id, String name, String phone, String email) {
    accounts.requireAdministrator(actor);
    String validName = AdminRules.name(name), validPhone = AdminRules.phone(phone);
    var before = accounts.lockMember(id);
    var after = accounts.changeContact(id, validName, validPhone, email);
    record(actor, "SELLER", id, contactSummary(before), contactSummary(after));
    return member(after);
  }

  private static MarketLocation location(AdminMarketInput input) {
    return new MarketLocation(
        input.regionCode(), input.address(), input.latitude(), input.longitude());
  }

  private static String marketSummary(LocatedMarketView market) {
    return "이름: "
        + market.name()
        + ", 지역: "
        + market.regionLabel()
        + ", 주소: "
        + market.address()
        + ", 위도: "
        + market.latitude()
        + ", 경도: "
        + market.longitude();
  }

  private static AdminMemberView member(MemberView v) {
    return new AdminMemberView(
        v.id(),
        v.loginId(),
        v.displayName(),
        v.role(),
        v.email(),
        v.contactName(),
        v.contactPhone());
  }

  private static String contactSummary(MemberView member) {
    return "ID="
        + member.loginId()
        + ", 담당자="
        + (member.contactName() == null ? "미등록" : member.contactName())
        + ", 연락처="
        + (member.contactPhone() == null ? "미등록" : member.contactPhone())
        + ", 이메일="
        + member.email();
  }

  private void record(String actor, String type, long id, String before, String after) {
    data.record(accounts.current(actor).id(), clock.instant(), type, id, before, after);
  }
}
