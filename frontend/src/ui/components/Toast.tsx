import type { ReactElement } from "react";

interface ToastProps {
  message: string | null;
}

/**
 * 상태 알림 토스트 컴포넌트
 * 접근성 role="status" 및 aria-live="polite"
 */
export function Toast({ message }: ToastProps): ReactElement | null {
  if (!message) {
    return null;
  }

  return (
    <div className="toast-region" role="status" aria-live="polite">
      <div className="toast-message-pill">
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
        <span>{message}</span>
      </div>
    </div>
  );
}
