import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { noticeStyle } from '../lib/format';
import type { AppNotice, NoticeTone } from '../types';

// 색상에만 의존하지 않도록(WCAG 1.4.1) 심각도를 아이콘 + 스크린리더용 접두사로도 전달한다.
const SEVERITY_LABEL: Record<NoticeTone, string> = {
  error: '오류',
  warning: '경고',
  success: '완료',
  info: '안내',
};

const SEVERITY_ICON: Record<NoticeTone, LucideIcon> = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

// 오류·경고는 즉시 알림(assertive/alert), 성공·안내는 공손하게(polite/status).
function isUrgent(tone: NoticeTone): boolean {
  return tone === 'error' || tone === 'warning';
}

export function NoticeBanner({
  notice,
  onClose,
  closeLabel = '알림 닫기',
  children,
}: {
  notice: AppNotice;
  onClose: () => void;
  closeLabel?: string;
  children?: ReactNode;
}) {
  const urgent = isUrgent(notice.tone);
  const Icon = SEVERITY_ICON[notice.tone];
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 text-xs leading-relaxed ${noticeStyle(
        notice.tone,
      )}`}
    >
      <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        <b className="block">
          <span className="sr-only">{SEVERITY_LABEL[notice.tone]}: </span>
          {notice.title}
        </b>
        {notice.message}
      </span>
      {children}
      <button
        type="button"
        className="shrink-0 leading-none hover:text-ink"
        title="닫기"
        aria-label={closeLabel}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
