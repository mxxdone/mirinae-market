import type { OfferView } from "../../api/types";

export function OfferCard({ offer, onOpen }: { offer: OfferView; onOpen: () => void }) {
  return (
    <article className="offer-card">
      <div className="offer-card-top">
        <span className={`pill-badge ${offer.onlineQuantity === 0 ? "secondary" : "primary"}`}>
          {offer.onlineQuantity === 0 ? "품절" : "오늘 수령"}
        </span>
      </div>
      <p className="offer-store-name">{offer.storeName}</p>
      <h3>{offer.productName}</h3>
      <p className="field-help-text">
        한 포장 · {offer.unitAmount.toLocaleString()}
        {offer.unitType === "WEIGHT" ? "g" : "개"}
      </p>
      <p className="offer-price">
        {offer.priceWon.toLocaleString()}
        <span>원 / 포장</span>
      </p>
      <p className="comparison-price">
        {offer.comparisonUnit}당{" "}
        {offer.comparisonPriceWon.toLocaleString("ko-KR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        원
      </p>
      <div className="offer-pickup">
        <span>주문 {offer.orderDeadline.slice(0, 5)} 마감</span>
        <span>
          수령 {offer.startTime.slice(0, 5)}~{offer.endTime.slice(0, 5)}
        </span>
        <span>온라인 {offer.onlineQuantity.toLocaleString()}포장</span>
      </div>
      <button className="btn-query-store offer-detail-button" onClick={onOpen} type="button">
        상품 상세 보기<span className="sr-only"> · {offer.productName}</span>
      </button>
    </article>
  );
}
