import { useEffect, useState, type ReactElement } from "react";
import { getHealth } from "../../api/health";

/**
 * 백엔드 서버 상태 표시 컴포넌트 (/actuator/health)
 * 실제 응답 결과를 간결하게 렌더링합니다.
 */
export function HealthBadge(): ReactElement {
  const [status, setStatus] = useState<string>("확인 중...");
  const [isUp, setIsUp] = useState<boolean | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function checkHealth(): Promise<void> {
      try {
        const response = await getHealth();
        if (isSubscribed) {
          setStatus(response.status === "UP" ? "연결됨" : "연결할 수 없음");
          setIsUp(response.status === "UP");
        }
      } catch {
        if (isSubscribed) {
          setStatus("연결 끊김");
          setIsUp(false);
        }
      }
    }

    void checkHealth();

    return () => {
      isSubscribed = false;
    };
  }, []);

  return (
    <div className="health-status-badge" role="status" aria-label={`서버 상태: ${status}`}>
      <span
        className={`health-dot ${isUp === true ? "up" : isUp === false ? "down" : ""}`}
        aria-hidden="true"
      />
      <span>서버 연결: {status}</span>
    </div>
  );
}
