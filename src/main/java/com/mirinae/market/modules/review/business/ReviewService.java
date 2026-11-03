package com.mirinae.market.modules.review.business;

import com.mirinae.market.modules.account.business.AccountService;
import com.mirinae.market.modules.checkout.business.FulfillmentService;
import com.mirinae.market.modules.checkout.business.ReviewOrderView;
import com.mirinae.market.modules.review.data.DeletionRequestRow;
import com.mirinae.market.modules.review.data.ReviewData;
import com.mirinae.market.modules.review.data.ReviewRow;
import com.mirinae.market.modules.review.data.ReviewSummaryRow;
import com.mirinae.market.modules.store.business.StoreNotFoundException;
import com.mirinae.market.modules.store.business.StoreService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ReviewService {
  private final ReviewData data;
  private final FulfillmentService fulfillment;
  private final StoreService stores;
  private final AccountService accounts;
  private final Clock clock;

  public ReviewService(
      ReviewData data,
      FulfillmentService fulfillment,
      StoreService stores,
      AccountService accounts,
      Clock clock) {
    this.data = data;
    this.fulfillment = fulfillment;
    this.stores = stores;
    this.accounts = accounts;
    this.clock = clock;
  }

  public ReviewPage<ReviewView> publicReviews(long market, long store, int page, int size) {
    ReviewRules.page(page, size);
    stores.publicStore(market, store);
    var rows = data.page(store, false, page * size, size + 1);
    return new ReviewPage<>(
        rows.stream().limit(size).map(ReviewService::view).toList(),
        page,
        size,
        rows.size() > size,
        data.count(store, false),
        summary(data.summaries(List.of(store)).getFirst()));
  }

  public List<ReviewSummary> summaries(long market, List<Long> ids) {
    if (ids == null
        || ids.isEmpty()
        || ids.size() > 100
        || ids.stream().anyMatch(id -> id == null || id < 1)) {
      throw new IllegalArgumentException("매장 ID는 양수 1~100개여야 합니다.");
    }
    var distinct = ids.stream().distinct().toList();
    if (stores.publicStoreIds(market, distinct).size() != distinct.size())
      throw new StoreNotFoundException();
    return data.summaries(distinct).stream().map(ReviewService::summary).toList();
  }

  public ReviewEditorView editor(String actor, long orderId) {
    var order = fulfillment.reviewOrder(actor, orderId);
    return editor(order, data.byOrder(orderId, false).orElse(null), clock.instant());
  }

  @Transactional
  public ReviewEditorView write(String actor, long orderId, BigDecimal rating, String content) {
    var order = fulfillment.reviewOrder(actor, orderId);
    int stars = ReviewRules.rating(rating);
    String text = ReviewRules.text(content);
    Instant now = clock.instant();
    var row = data.byOrder(orderId, true).orElse(null);
    boolean inserted = false;
    if (row == null) {
      if (!ReviewRules.canCreate(order.pickedUpAt(), now))
        throw new ReviewConflictException("신규 리뷰는 수령 완료 후 30일 이내에 작성할 수 있습니다.");
      inserted = data.insert(orderId, order.storeId(), stars, text, now);
      row = data.byOrder(orderId, true).orElseThrow(ReviewNotFoundException::new);
    }
    ReviewRules.requireEditable(row.authorDeletedAt() != null, row.adminDeletedAt() != null);
    if (!inserted) data.edit(row.id(), stars, text, now);
    return editor(order, data.byOrder(orderId, false).orElseThrow(), now);
  }

  @Transactional
  public void deleteOwn(String actor, long orderId) {
    fulfillment.reviewOrder(actor, orderId);
    var row = data.byOrder(orderId, true).orElseThrow(ReviewNotFoundException::new);
    data.authorDelete(row.id(), clock.instant());
  }

  @Transactional
  public ReviewEditorView restoreOwn(String actor, long orderId) {
    var order = fulfillment.reviewOrder(actor, orderId);
    var row = data.byOrder(orderId, true).orElseThrow(ReviewNotFoundException::new);
    ReviewRules.requireAuthorRestore(row.adminDeletedAt() != null);
    data.authorRestore(row.id());
    return editor(order, data.byOrder(orderId, false).orElseThrow(), clock.instant());
  }

  public ReviewPage<SellerReviewView> sellerReviews(String actor, long store, int page, int size) {
    stores.ownedStore(actor, store);
    ReviewRules.page(page, size);
    var rows = data.page(store, false, page * size, size + 1);
    return new ReviewPage<>(
        rows.stream()
            .limit(size)
            .map(row -> new SellerReviewView(view(row), row.deletionRequested()))
            .toList(),
        page,
        size,
        rows.size() > size,
        data.count(store, false),
        summary(data.summaries(List.of(store)).getFirst()));
  }

  @Transactional
  public ReviewView reply(String actor, long store, long review, String content) {
    var row = sellerReview(actor, store, review);
    data.reply(row.id(), ReviewRules.text(content), clock.instant());
    return view(data.byId(review, false).orElseThrow());
  }

  @Transactional
  public DeletionRequestView requestDeletion(String actor, long store, long review, String reason) {
    var row = sellerReview(actor, store, review);
    String text = ReviewRules.reason(reason);
    data.request(row.id(), accounts.current(actor).id(), text, clock.instant());
    return request(data.pendingRequest(review).orElseThrow());
  }

  public ReviewPage<ManagedReviewView> managedReviews(String actor, int page, int size) {
    accounts.requireAdministrator(actor);
    ReviewRules.page(page, size);
    var rows = data.page(null, true, page * size, size + 1);
    return new ReviewPage<>(
        rows.stream()
            .limit(size)
            .map(
                row ->
                    new ManagedReviewView(
                        view(row),
                        row.storeOrderId(),
                        row.storeName(),
                        row.authorDeletedAt() != null,
                        row.adminDeletedAt() != null,
                        row.adminReason()))
            .toList(),
        page,
        size,
        rows.size() > size,
        data.count(null, true),
        null);
  }

  @Transactional
  public boolean adminDelete(String actor, long review, String reason) {
    accounts.requireAdministrator(actor);
    String text = ReviewRules.reason(reason);
    var row = data.byId(review, true).orElseThrow(ReviewNotFoundException::new);
    if (row.adminDeletedAt() != null) return false;
    data.adminDelete(review, accounts.current(actor).id(), text, clock.instant());
    return true;
  }

  @Transactional
  public boolean adminRestore(String actor, long review) {
    accounts.requireAdministrator(actor);
    var row = data.byId(review, true).orElseThrow(ReviewNotFoundException::new);
    if (row.adminDeletedAt() == null) return false;
    data.adminRestore(review);
    return true;
  }

  public ReviewPage<DeletionRequestView> requests(String actor, int page, int size) {
    accounts.requireAdministrator(actor);
    ReviewRules.page(page, size);
    var rows = data.requests(page * size, size + 1);
    return new ReviewPage<>(
        rows.stream().limit(size).map(ReviewService::request).toList(),
        page,
        size,
        rows.size() > size,
        data.requestCount(),
        null);
  }

  @Transactional
  public ReviewDecisionResult decide(String actor, long id, boolean approved, String reason) {
    accounts.requireAdministrator(actor);
    String text = ReviewRules.reason(reason);
    var initial = data.request(id, false).orElseThrow(ReviewNotFoundException::new);
    // 판매자 요청과 같은 순서로 리뷰→삭제 요청 행을 잠근다.
    var review = data.byId(initial.reviewId(), true).orElseThrow(ReviewNotFoundException::new);
    var row = data.request(id, true).orElseThrow(ReviewNotFoundException::new);
    String status = approved ? "APPROVED" : "REJECTED";
    if (!row.status().equals("PENDING")) {
      if (row.status().equals(status) && text.equals(row.decisionReason()))
        return new ReviewDecisionResult(request(row), false);
      throw new ReviewConflictException("이미 처리된 삭제 요청입니다.");
    }
    long administrator = accounts.current(actor).id();
    Instant now = clock.instant();
    if (approved && review.adminDeletedAt() == null)
      data.adminDelete(review.id(), administrator, text, now);
    data.decide(id, administrator, status, text, now);
    return new ReviewDecisionResult(request(data.request(id, false).orElseThrow()), true);
  }

  private ReviewRow sellerReview(String actor, long store, long id) {
    stores.ownedStore(actor, store);
    var row = data.byId(id, true).orElseThrow(ReviewNotFoundException::new);
    if (row.storeId() != store) throw new ReviewNotFoundException();
    ReviewRules.requireEditable(row.authorDeletedAt() != null, row.adminDeletedAt() != null);
    return row;
  }

  private static ReviewEditorView editor(ReviewOrderView order, ReviewRow row, Instant now) {
    return new ReviewEditorView(
        order.storeOrderId(),
        order.storeId(),
        ReviewRules.deadline(order.pickedUpAt()),
        row == null && ReviewRules.canCreate(order.pickedUpAt(), now),
        row == null
            ? null
            : new ReviewEditorView.OwnedReview(
                view(row), row.authorDeletedAt() != null, row.adminDeletedAt() != null));
  }

  private static ReviewView view(ReviewRow row) {
    return new ReviewView(
        row.id(),
        row.storeId(),
        row.rating(),
        row.content(),
        row.createdAt(),
        row.updatedAt(),
        row.replyContent() == null
            ? null
            : new ReviewView.Reply(row.replyContent(), row.replyUpdatedAt()));
  }

  private static ReviewSummary summary(ReviewSummaryRow row) {
    return new ReviewSummary(row.storeId(), row.averageRating(), row.reviewCount());
  }

  private static DeletionRequestView request(DeletionRequestRow row) {
    return new DeletionRequestView(
        row.id(),
        row.reviewId(),
        row.storeId(),
        row.storeName(),
        row.rating(),
        row.content(),
        row.reason(),
        row.status(),
        row.decisionReason(),
        row.createdAt());
  }
}
