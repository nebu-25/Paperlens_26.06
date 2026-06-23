import { Sparkles } from 'lucide-react';

interface AiDraftButtonProps {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  onClick?: () => void;
}

export function AiDraftButton({
  label = 'AI 초안',
  disabled = true,
  loading = false,
  title = 'AI 보조 레이어는 준비 중입니다 (코어 기능은 AI 없이 동작)',
  onClick,
}: AiDraftButtonProps) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted enabled:hover:border-action enabled:hover:text-action disabled:opacity-60"
      disabled={disabled || loading}
      title={title}
      onClick={onClick}
    >
      <Sparkles size={12} />
      {loading ? '생성 중' : disabled ? `${label} · 준비 중` : label}
    </button>
  );
}
