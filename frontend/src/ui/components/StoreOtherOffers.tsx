import { useEffect, useState } from "react";
import { getStoreOffers } from "../../api/store";
import { ApiError, type OfferView } from "../../api/types";
import { useProductImages } from "../useProductImages";
import { OfferCard } from "./OfferCard";

export function StoreOtherOffers({
  selected,
  onOpen,
  onOpenStore,
  onSessionExpired,
}: {
  selected: OfferView;
  onOpen: (offer: OfferView) => void;
  onOpenStore: (storeId: number) => void;
  onSessionExpired: () => void;
}) {
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFailed(false);
    void getStoreOffers(selected.marketId, selected.storeId, "", 0, controller.signal)
      .then((result) => {
        if (active)
          setOffers(
            result.items.filter((offer) => offer.productId !== selected.productId).slice(0, 4),
          );
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 401) onSessionExpired();
        else setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected.marketId, selected.storeId, selected.productId, version, onSessionExpired]);
  const images = useProductImages(
    selected.marketId,
    offers.map((offer) => offer.productId),
    onSessionExpired,
  );
  if (!loading && !failed && offers.length === 0) return null;
  return (
    <section
      className="store-other-offers"
      aria-labelledby="otherOffersHeading"
      aria-busy={loading}
    >
      <div className="store-other-offers-heading">
        <h2 id="otherOffersHeading">이 매장의 다른 상품</h2>
        <button
          className="text-action-link"
          type="button"
          onClick={() => onOpenStore(selected.storeId)}
        >
          매장 상품 전체 보기
        </button>
      </div>
      {loading ? (
        <p role="status">다른 상품을 불러오고 있습니다.</p>
      ) : failed ? (
        <p role="alert">
          다른 상품을 불러오지 못했습니다.{" "}
          <button type="button" onClick={() => setVersion((value) => value + 1)}>
            다른 상품 다시 조회
          </button>
        </p>
      ) : (
        <>
          {images.failed && (
            <p role="alert">
              사진을 불러오지 못했습니다.{" "}
              <button type="button" onClick={images.retry}>
                다른 상품 사진 다시 조회
              </button>
            </p>
          )}
          <div className="offer-grid" data-view="grid">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                image={images.images[offer.productId]}
                showStore={false}
                compact
                onOpen={() => onOpen(offer)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
