import { useState } from "react";
import type { ProductImage } from "../../api/productImages";

export function ProductPhoto({
  image,
  name,
  detail = false,
  list = false,
}: {
  image?: ProductImage | null;
  name: string;
  detail?: boolean;
  list?: boolean;
}) {
  const [failedSource, setFailedSource] = useState("");
  const variants = [
    ...new Map((image?.variants ?? []).map((item) => [item.width, item])).values(),
  ].sort((a, b) => a.width - b.width);
  const largest = variants.at(-1);
  const source = largest?.url ?? "/images/product-placeholder.svg";
  const failed = failedSource === source;
  return (
    <div
      className={`product-photo${detail ? " product-photo--detail" : ""}${!largest || failed ? " product-photo--placeholder" : ""}`}
    >
      {failed ? (
        <span className="product-photo-fallback" role="img" aria-label={`${name} 기본 이미지`}>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <rect x="5" y="8" width="38" height="32" rx="4" />
            <circle cx="16" cy="18" r="3" />
            <path d="m8 35 12-12 8 8 5-5 8 9" />
          </svg>
          <span>상품 이미지</span>
        </span>
      ) : (
        <img
          src={source}
          srcSet={
            variants.length
              ? variants.map((item) => `${item.url} ${item.width}w`).join(", ")
              : undefined
          }
          sizes={
            detail
              ? "(max-width: 767px) 85vw, 420px"
              : list
                ? "(max-width: 599px) 80px, 140px"
                : "(max-width: 599px) 85vw, 320px"
          }
          width={largest?.width ?? 800}
          height={largest?.height ?? 800}
          alt={`${name} 상품 이미지`}
          loading={detail ? "eager" : "lazy"}
          onError={() => setFailedSource(source)}
        />
      )}
    </div>
  );
}
