import { ExternalLink, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import { DEMO_SURVEY_URL } from '../constants';
import {
  markSurveyCompleted,
  markSurveyHiddenForSession,
  type SurveyPromptReason,
} from '../lib/surveyPrompt';

interface SurveyPromptProps {
  reason: SurveyPromptReason;
  onClose: () => void;
}

export function SurveyPrompt({ reason, onClose }: SurveyPromptProps) {
  const [hideForSession, setHideForSession] = useState(false);
  const isExport = reason === 'export';

  const close = () => {
    if (hideForSession) markSurveyHiddenForSession();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="데모 설문 참여 요청"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 p-4"
    >
      <div className="w-full max-w-md rounded border border-line bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MessageSquare size={17} className="text-action" />
          <h2 className="text-base font-semibold text-ink">
            {isExport ? '데모 사용 경험을 알려주세요' : '나가기 전에 1분만 알려주세요'}
          </h2>
          <button
            type="button"
            className="ml-auto rounded p-1 text-muted hover:bg-paper hover:text-ink"
            aria-label="설문 요청 닫기"
            onClick={close}
          >
            <X size={17} />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm leading-relaxed text-muted">
            {isExport
              ? '방금 만든 결과물이 실제 논문 읽기에 도움이 될지 확인하고 있습니다.'
              : 'PaperLens 첫 사용 경험을 개선하기 위한 짧은 설문입니다.'}
            {' '}약 1분 설문에 참여해 주시면 화면 흐름과 용어를 개선하는 데 사용하겠습니다.
          </p>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="accent-action"
              checked={hideForSession}
              onChange={(event) => setHideForSession(event.target.checked)}
            />
            <span>이 데모 세션에서는 다시 보지 않기</span>
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded border border-line px-3 py-2 text-sm font-medium text-muted hover:border-action hover:text-action"
              onClick={close}
            >
              {isExport ? '닫기' : '그냥 나가기'}
            </button>
            <a
              href={DEMO_SURVEY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-action/90"
              onClick={() => {
                markSurveyCompleted();
                onClose();
              }}
            >
              설문 참여하기
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
