import type { ReactElement, ReactNode } from "react";

interface BrandHeaderProps {
  onHome: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

export function BrandHeader({
  onHome,
  disabled = false,
  children,
}: BrandHeaderProps): ReactElement {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <button
          type="button"
          className="brand-home"
          onClick={onHome}
          disabled={disabled}
          aria-label="미리내마켓 홈"
        >
          <img src="/images/mirinae-symbol.svg" width="36" height="36" alt="" />
          <span>미리내마켓</span>
        </button>
        {children}
      </div>
    </header>
  );
}
