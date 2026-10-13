import type { ReactElement } from "react";

/**
 * 온기 있는 골목길 골목 상점 및 단골 풍경 인라인 SVG 일러스트
 * 외부 이미지 파일 및 외부 폰트 라이브러리 없이 순수 SVG로 렌더링합니다.
 */
interface StoreIllustrationProps {
  variant?: "shop" | "basket";
}

export function StoreIllustration({ variant = "shop" }: StoreIllustrationProps): ReactElement {
  if (variant === "basket") {
    return (
      <div className="store-illustration-box" aria-hidden="true">
        <svg
          className="store-illustration-svg"
          viewBox="0 0 240 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 전통 가옥 처마선 */}
          <path
            d="M20 38 C 70 30, 170 30, 220 38"
            stroke="#443c36"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="35" y="42" width="170" height="18" fill="#c4552b" rx="2" />
          <path
            d="M 35 60 Q 45 66, 55 60 Q 65 66, 75 60 Q 85 66, 95 60 Q 105 66, 115 60 Q 125 66, 135 60 Q 145 66, 155 60 Q 165 66, 175 60 Q 185 66, 195 60 Q 205 66, 205 60"
            stroke="#c4552b"
            strokeWidth="2"
            fill="#fffdfa"
          />

          {/* 단골 보자기/장바구니 일러스트 */}
          <rect
            x="95"
            y="72"
            width="50"
            height="42"
            rx="4"
            fill="#f7efe4"
            stroke="#ded5c7"
            strokeWidth="1.5"
          />
          <path
            d="M 110 72 C 110 60, 130 60, 130 72"
            stroke="#b94b23"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="120" cy="92" r="10" fill="#faeee8" />
          <path
            d="M 116 92 L 119 95 L 125 89"
            stroke="#b94b23"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 바닥 라인 */}
          <line
            x1="20"
            y1="120"
            x2="220"
            y2="120"
            stroke="#ded5c7"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="store-illustration-box" aria-hidden="true">
      <svg
        className="store-illustration-svg"
        viewBox="0 0 240 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 전통 기와 처마선 */}
        <path d="M15 48 C 60 40, 180 40, 225 48 L 230 54 L 10 54 Z" fill="#443c36" />
        <path
          d="M8 52 C 70 42, 170 42, 232 52"
          stroke="#b94b23"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* 상점 천막 차양 (테라코타 스트라이프) */}
        <rect x="25" y="54" width="190" height="24" rx="2" fill="#c4552b" />
        <path
          d="M 45 54 L 45 78 M 75 54 L 75 78 M 105 54 L 105 78 M 135 54 L 135 78 M 165 54 L 165 78 M 195 54 L 195 78"
          stroke="#faeee8"
          strokeWidth="3"
          strokeDasharray="3 1"
          opacity="0.4"
        />
        <path
          d="M 25 78 Q 35 84, 45 78 Q 55 84, 65 78 Q 75 84, 85 78 Q 95 84, 105 78 Q 115 84, 125 78 Q 135 84, 145 78 Q 155 84, 165 78 Q 175 84, 185 78 Q 195 84, 205 78 Q 215 84, 215 78"
          stroke="#c4552b"
          strokeWidth="3"
          fill="#fdfbf8"
        />

        {/* 따스한 등불 조명 */}
        <circle cx="50" cy="90" r="7" fill="#fadc8c" opacity="0.85" />
        <circle cx="50" cy="90" r="14" fill="#fadc8c" opacity="0.25" />
        <line x1="50" y1="78" x2="50" y2="84" stroke="#574e47" strokeWidth="1.5" />

        {/* 상점 진열대 및 목조 쇼케이스 */}
        <rect
          x="35"
          y="96"
          width="170"
          height="36"
          rx="4"
          fill="#f5eee3"
          stroke="#ded5c7"
          strokeWidth="1.5"
        />
        <rect x="45" y="104" width="38" height="20" rx="3" fill="#ffffff" stroke="#ded5c7" />
        <rect x="91" y="104" width="38" height="20" rx="3" fill="#ffffff" stroke="#ded5c7" />
        <rect x="137" y="104" width="38" height="20" rx="3" fill="#ffffff" stroke="#ded5c7" />
        <circle cx="64" cy="114" r="5" fill="#c4552b" opacity="0.8" />
        <circle cx="110" cy="114" r="5" fill="#286b43" opacity="0.8" />
        <circle cx="156" cy="114" r="5" fill="#d9822b" opacity="0.8" />

        {/* 매장 바닥 라인 */}
        <line
          x1="15"
          y1="134"
          x2="225"
          y2="134"
          stroke="#ded5c7"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
