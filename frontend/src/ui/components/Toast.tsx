import type { ReactElement } from "react";

export interface ToastNotice {
  id: number;
  message: string;
  kind: "default" | "cart";
}

/**
 * 상태 알림 토스트 컴포넌트
 * 접근성 role="status" 및 aria-live="polite"
 */
export function Toast({ notice }: { notice: ToastNotice | null }): ReactElement {
  return (
    <div
      className={notice?.kind === "cart" ? "toast-region toast-region--cart" : "toast-region"}
      role="status"
      aria-atomic="true"
    >
      {notice && (
        <div className="toast-message-pill" key={notice.id}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  );
}
