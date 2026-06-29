import { useState } from 'react';
import { PencilLine, Plus, Trash2 } from 'lucide-react';
import { uid } from '../lib/notes';
import type { Question } from '../types';
import { SectionCard } from './SectionCard';

export function QuestionsCard({
  questions,
  onChange,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    if (!draft.trim()) return;
    onChange([...questions, { id: uid(), text: draft.trim() }]);
    setDraft('');
  }
  return (
    <SectionCard title="읽으며 생긴 질문" icon={<PencilLine size={16} />}>
      <div className="mb-2 flex gap-2">
        <input
          name="review-question"
          className="w-full rounded border border-line p-2 text-sm outline-none focus:border-action"
          placeholder="읽다가 생긴 질문을 기록하세요."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          className="flex shrink-0 items-center gap-1 rounded border border-line px-3 text-sm"
          onClick={add}
        >
          <Plus size={14} /> 추가
        </button>
      </div>
      {questions.length > 0 && (
        <ul className="space-y-1">
          {questions.map((q) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-2 rounded bg-paper p-2 text-sm"
            >
              <span>Q. {q.text}</span>
              <button
                className="shrink-0 text-muted hover:text-ink"
                onClick={() => onChange(questions.filter((x) => x.id !== q.id))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
