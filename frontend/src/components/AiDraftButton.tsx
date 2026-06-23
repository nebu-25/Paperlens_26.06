import { Sparkles } from 'lucide-react';

export function AiDraftButton({ label = 'AI 초안' }: { label?: string }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted"
      disabled
      title="AI 보조 레이어는 준비 중입니다 (코어 기능은 AI 없이 동작)"
    >
      <Sparkles size={12} />
      {label} · 준비 중
    </button>
  );
}
