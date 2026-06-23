import { useState } from 'react';

export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const t = draft.trim().replace(/^#+/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  }
  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full bg-action/10 px-2 py-0.5 text-xs text-action"
            >
              #{t}
              <button
                className="leading-none hover:text-ink"
                title="태그 삭제"
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-action"
        placeholder="태그 추가 (Enter)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}
