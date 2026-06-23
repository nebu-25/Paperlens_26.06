import type { Source } from '../types';

export function SourceBadge({ filled, source }: { filled: boolean; source: Source }) {
  if (!filled) return null;
  if (source === 'ai_draft') {
    return <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">초안</span>;
  }
  return (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">내가 작성</span>
  );
}
