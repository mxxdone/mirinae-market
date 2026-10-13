import type { ReactElement } from "react";

interface StatusAlertProps {
  message: string | null;
  type?: "error" | "info";
  onRetry?: () => void;
  id?: string;
}

/**
 * 인라인 상태 및 오류 안내 배너
 * 접근성 role="alert" 및 aria-live 지원
 */
export function StatusAlert({
  message,
  type = "error",
  onRetry,
  id,
}: StatusAlertProps): ReactElement | null {
  if (!message) {
    return null;
  }

  return (
    <div
      id={id}
      className={`status-alert-box ${type === "info" ? "info" : ""}`}
      role="alert"
      aria-live="assertive"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: "transparent",
            border: "1px solid currentColor",
            color: "inherit",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
