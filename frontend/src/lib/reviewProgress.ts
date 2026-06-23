import type { ReviewNote } from '../types';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export function buildChecklist(note: ReviewNote): ChecklistItem[] {
  const summaryDone =
    note.summaryMode === 'section'
      ? note.sectionSummaries.some((s) => s.content.trim().length > 0)
      : Object.values(note.template).some((v) => v.trim().length > 0);

  return [
    { label: '한 줄 요약', done: note.oneLineSummary.trim().length > 0 },
    { label: note.summaryMode === 'section' ? '섹션별 요약' : '5문항 템플릿', done: summaryDone },
    { label: '핵심 문장 하이라이트', done: note.highlights.length > 0 },
    { label: '핵심 용어 사전', done: note.terms.length > 0 },
    { label: '읽으며 생긴 질문', done: note.questions.length > 0 },
    { label: '섹션별 메모', done: Object.values(note.memos).some((v) => v.trim().length > 0) },
  ];
}

export function countDone(items: ChecklistItem[]): number {
  return items.filter((item) => item.done).length;
}
