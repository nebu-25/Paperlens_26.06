import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ONBOARDING_STEPS } from '../constants';

interface OnboardingGuideProps {
  onClose: () => void;
}

// 첫 사용 순서를 짚어 주는 가벼운 모달 스테퍼. 스포트라이트 투어 대신 모달을 쓰는 이유는
// 반응형 그리드/모바일 탭 전환에서 DOM 앵커가 쉽게 깨지기 때문이다(설계 결정).
export function OnboardingGuide({ onClose }: OnboardingGuideProps) {
  const [step, setStep] = useState(0);
  const total = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PaperLens 시작 가이드"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded border border-line bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Compass size={17} className="text-action" />
          <h2 className="text-base font-semibold text-ink">PaperLens 사용 순서</h2>
          <button
            type="button"
            className="ml-auto rounded p-1 text-muted hover:bg-paper hover:text-ink"
            aria-label="가이드 닫기"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {step + 1} / {total} 단계
          </p>
          <div>
            <h3 className="text-lg font-bold text-ink">
              {step + 1}. {current.label}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.description}</p>
          </div>

          {/* 단계 표시 점 */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {ONBOARDING_STEPS.map((s, index) => (
              <span
                key={s.label}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-5 bg-action' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-line px-3 py-2 text-sm font-medium text-muted enabled:hover:border-action enabled:hover:text-action disabled:opacity-40"
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
              disabled={isFirst}
            >
              <ArrowLeft size={14} />
              이전
            </button>
            {isLast ? (
              <button
                type="button"
                className="rounded bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action/90"
                onClick={onClose}
              >
                시작하기
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-action/90"
                onClick={() => setStep((prev) => Math.min(total - 1, prev + 1))}
              >
                다음
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
