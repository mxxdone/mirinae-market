import type { OfferView } from "../../api/types";
import type { ReviewSummary } from "../../api/reviews";
import type { ProductImage } from "../../api/productImages";
import { ProductPhoto } from "./ProductPhoto";
import { StoreRating } from "./StoreReviews";

export function OfferCard({
  offer,
  image,
  view = "grid",
  onOpen,
  onOpenStore,
  rating,
  ratingLoading,
  ratingError,
  onAdd,
  adding = false,
  showStore = true,
  compact = false,
}: {
  offer: OfferView;
  image?: ProductImage;
  view?: "list" | "grid";
  onOpen: () => void;
  onOpenStore?: (storeId: number) => void;
  rating?: ReviewSummary;
  ratingLoading?: boolean;
  ratingError?: boolean;
  onAdd?: () => void;
  adding?: boolean;
  showStore?: boolean;
  compact?: boolean;
}) {
  return (
    <article className="offer-card">
      <button
        type="button"
        className="offer-photo-button"
        aria-label={`${offer.productName} 사진으로 상세 보기`}
        onClick={onOpen}
      >
        <ProductPhoto image={image} name={offer.productName} list={view === "list"} />
      </button>
      <div className="offer-card-info">
        <div className="offer-card-main">
          <div className="offer-card-top">
            <h3>
              <button type="button" className="offer-product-name" onClick={onOpen}>
                {offer.productName}
              </button>
            </h3>
            <span className={`pill-badge ${offer.onlineQuantity === 0 ? "secondary" : "primary"}`}>
              {offer.onlineQuantity === 0 ? "품절" : "오늘 수령"}
            </span>
          </div>
          <p className="field-help-text">
            한 포장 · {offer.unitAmount.toLocaleString()}
            {offer.unitType === "WEIGHT" ? "g" : "개"}
          </p>
          {showStore && (
            <p className="offer-store-name">
              {onOpenStore ? (
                <button
                  type="button"
                  className="text-action-link offer-store-link"
                  onClick={() => onOpenStore(offer.storeId)}
                >
                  {offer.storeName}
                </button>
              ) : (
                offer.storeName
              )}
            </p>
          )}
          {(rating || ratingLoading || ratingError) && (
            <StoreRating summary={rating} loading={ratingLoading} failed={ratingError} />
          )}
        </div>
        <div className="offer-card-pricing">
          <p className="offer-price">
            {offer.priceWon.toLocaleString()}
            <span>원 / 포장</span>
          </p>
          {!compact && (
            <p className="comparison-price">
              {offer.comparisonUnit}당{" "}
              {offer.comparisonPriceWon.toLocaleString("ko-KR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              원
            </p>
          )}
        </div>
        {!compact && (
          <div className="offer-pickup">
            <span>주문 {offer.orderDeadline.slice(0, 5)} 마감</span>
            <span>
              수령 {offer.startTime.slice(0, 5)}~{offer.endTime.slice(0, 5)}
            </span>
            <span>온라인 {offer.onlineQuantity.toLocaleString()}포장</span>
          </div>
        )}
        {onAdd && (
          <div className="offer-actions">
            <button
              type="button"
              className="btn-secondary-sm btn-store-add-cart"
              disabled={adding || offer.onlineQuantity === 0}
              onClick={onAdd}
            >
              장바구니 담기
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
