import { useEffect, useRef, useState, type ReactElement } from "react";
import { CartButton } from "./CartButton";

interface BuyerHeaderActionsProps {
  cartCount: number | null;
  isLoggingOut: boolean;
  activePage: "account" | "orders" | null;
  onCart: () => void;
  onAccount: () => void;
  onOrders: () => void;
  onLogout: () => void;
}

export function BuyerHeaderActions({
  cartCount,
  isLoggingOut,
  activePage,
  onCart,
  onAccount,
  onOrders,
  onLogout,
}: BuyerHeaderActionsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !account.current?.contains(event.target)) setOpen(false);
    }
    function dismissEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [open]);

  function select(action: () => void): void {
    setOpen(false);
    trigger.current?.focus();
    action();
  }

  return (
    <nav className="buyer-utility-nav" aria-label="구매자 메뉴">
      <CartButton
        count={cartCount}
        onClick={() => {
          setOpen(false);
          onCart();
        }}
        disabled={isLoggingOut}
      />
      <div
        className="buyer-account-actions"
        ref={account}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className="header-icon-button"
          aria-label="계정 메뉴"
          title="계정 메뉴"
          aria-expanded={open}
          aria-controls="buyer-account-menu"
          disabled={isLoggingOut}
          onClick={() => setOpen((previous) => !previous)}
          ref={trigger}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
          </svg>
        </button>
        {open && (
          <div className="buyer-account-dropdown" id="buyer-account-menu">
            <button
              type="button"
              onClick={() => select(onAccount)}
              disabled={isLoggingOut}
              aria-current={activePage === "account" ? "page" : undefined}
            >
              내 계정
            </button>
            <button
              type="button"
              onClick={() => select(onOrders)}
              disabled={isLoggingOut}
              aria-current={activePage === "orders" ? "page" : undefined}
            >
              주문 내역
            </button>
            <button
              type="button"
              className="account-menu-logout"
              id="btnLogout"
              onClick={() => select(onLogout)}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
