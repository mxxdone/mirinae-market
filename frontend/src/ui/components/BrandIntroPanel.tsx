import type { ReactElement } from "react";
import { StoreIllustration } from "./StoreIllustration";

interface GuideStep {
  number: string | number;
  title: string;
  desc: string;
}

interface BrandIntroPanelProps {
  servicePill: string;
  sealText: string;
  headline: string;
  subtext: string;
  steps: GuideStep[];
  footerNote: string;
  variant?: "shop" | "basket";
}

/**
 * 데스크톱 40% 좌측 브랜딩 소개 패널
 * 모바일(390px) 환경에서는 일러스트 및 긴 가이드를 생략하고 핵심 헤드라인만 축소 표시합니다.
 */
export function BrandIntroPanel({
  servicePill,
  sealText,
  headline,
  subtext,
  steps,
  footerNote,
  variant = "shop",
}: BrandIntroPanelProps): ReactElement {
  return (
    <div className="brand-intro-panel">
      <div className="brand-intro-content">
        <div className="brand-tag-row">
          <span className="brand-service-pill">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {servicePill}
          </span>
          <div className="seal-icon-small" title="미리내 마켓 인장" aria-hidden="true">
            {sealText}
          </div>
        </div>

        <div>
          <h1 className="brand-headline">{headline.replace(", ", ",\n")}</h1>
          <p className="brand-subtext">{subtext}</p>
        </div>

        <StoreIllustration variant={variant} />

        <div className="steps-guide-list">
          {steps.map((step) => (
            <div key={String(step.number) + step.title} className="guide-step-item">
              <span className="step-number-bullet" aria-hidden="true">
                {step.number}
              </span>
              <div>
                <div className="step-info-title">{step.title}</div>
                <div className="step-info-desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="brand-intro-footer">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>{footerNote}</span>
      </div>
    </div>
  );
}
