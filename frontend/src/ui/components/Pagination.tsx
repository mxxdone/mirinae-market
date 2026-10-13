export function Pagination({
  page,
  size,
  totalItems,
  disabled = false,
  onPage,
  label,
}: {
  page: number;
  size: number;
  totalItems: number;
  disabled?: boolean;
  onPage: (page: number) => void;
  label: string;
}) {
  const count = Math.max(1, Math.ceil(totalItems / size));
  const start = Math.max(0, Math.min(page - 2, count - 5));
  const pages = Array.from({ length: Math.min(5, count) }, (_, index) => start + index);
  function number(value: number) {
    return (
      <button
        type="button"
        key={value}
        className="pagination-button"
        aria-label={`${value + 1}페이지`}
        aria-current={page === value ? "page" : undefined}
        disabled={disabled}
        onClick={() => onPage(value)}
      >
        {value + 1}
      </button>
    );
  }
  return (
    <nav className="market-pagination" aria-label={label}>
      <button
        type="button"
        className="pagination-button"
        aria-label="이전 페이지"
        disabled={disabled || page === 0}
        onClick={() => onPage(page - 1)}
      >
        ‹
      </button>
      {start > 0 && number(0)}
      {start > 1 && <span aria-hidden="true">…</span>}
      {pages.map(number)}
      {start + pages.length < count - 1 && <span aria-hidden="true">…</span>}
      {start + pages.length < count && number(count - 1)}
      <button
        type="button"
        className="pagination-button"
        aria-label="다음 페이지"
        disabled={disabled || page >= count - 1}
        onClick={() => onPage(page + 1)}
      >
        ›
      </button>
    </nav>
  );
}
