export function CartButton({
  count,
  onClick,
  disabled = false,
}: {
  count: number | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="text-action-link cart-button"
      aria-label="장바구니"
      aria-description={count === null ? undefined : `상품 ${count}종류`}
      onClick={onClick}
      disabled={disabled}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2 3h3l3 13h11l3-9H6" />
        <circle cx="10" cy="21" r="1" />
        <circle cx="18" cy="21" r="1" />
      </svg>
      장바구니
      {count !== null && (
        <span className="cart-count" aria-hidden="true" data-testid="cart-count">
          {count}
        </span>
      )}
      {count !== null && <span className="sr-only">상품 {count}종류</span>}
    </button>
  );
}
