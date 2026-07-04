import type { ReviewNote } from '../types';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export function buildChecklist(note: ReviewNote): ChecklistItem[] {
  const templateDone =
    (note.manualSummaries ?? []).some((item) => item.text.trim().length > 0)
    || Object.values(note.template).some((v) => v.trim().length > 0)
    || Object.values(note.templateAnswers ?? {}).some((answers) =>
      Object.values(answers).some((v) => v.trim().length > 0),
    );

  return [
    { label: '수동 요약 템플릿', done: templateDone },
    { label: '하이라이트', done: note.highlights.length > 0 },
    { label: '용어 사전', done: note.terms.length > 0 },
    { label: '읽으며 생긴 질문', done: note.questions.length > 0 },
  ];
}

export function countDone(items: ChecklistItem[]): number {
  return items.filter((item) => item.done).length;
}
