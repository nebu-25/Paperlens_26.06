// 3-pass 읽기 로드맵 (기획서 v4.0 §8-3b, FR-20) — 깊이 축.
// 훑기→표적→정독은 모든 읽기 목적이 공유하고, 정독(pass 3)의 완료 기준만
// 활성 목적 템플릿(lib/templates.ts)이 정한다. 순수 함수만 둔다.
import type { HighlightColor, ReviewNote } from '../types';
import type { PurposeTemplateDef } from './templates';
import { getPurposeAnswers } from './templates';

export type ReadingPassId = 'skim' | 'target' | 'deep';

export interface ReadingPass {
  id: ReadingPassId;
  label: string;
  // 이 pass에서 읽는 범위
  scope: string;
  helper: string;
  done: boolean;
}

const hasColor = (note: ReviewNote, color: HighlightColor) =>
  note.highlights.some((h) => (h.color ?? 'yellow') === color);

const hasComparisonCitation = (note: ReviewNote) =>
  note.highlights.some((h) => h.citationUse === 'comparison')
  || note.manualSummaries.some((m) => m.citationUse === 'comparison');

export function buildReadingRoadmap(
  note: ReviewNote,
  template: PurposeTemplateDef,
): ReadingPass[] {
  const answers = getPurposeAnswers(note, template.id);
  const firstQuestionKey = template.questions[0]?.key;
  const firstAnswered =
    firstQuestionKey !== undefined && (answers[firstQuestionKey] ?? '').trim().length > 0;

  // Pass 1 훑기: 뼈대를 잡았다는 신호 — 첫 질문 답변, 주장 하이라이트, 한 줄 요약 중 하나.
  const skimDone =
    firstAnswered || hasColor(note, 'yellow') || note.oneLineSummary.trim().length > 0;

  // Pass 2 표적: 핵심 결과를 확인했다는 신호 — 결과 하이라이트 또는 결과 비교 인용 후보.
  const targetDone = hasColor(note, 'blue') || hasComparisonCitation(note);

  // Pass 3 정독: 활성 목적 템플릿의 완료 기준을 따른다.
  const deepDone = template.isComplete(note);

  return [
    {
      id: 'skim',
      label: '1차 훑기',
      scope: '제목 · 초록 · 결론',
      helper:
        '정독할 가치가 있는지 판단하세요. 첫 질문에 답하거나 주장 하이라이트를 남기면 완료됩니다.',
      done: skimDone,
    },
    {
      id: 'target',
      label: '2차 표적 읽기',
      scope: '서론 · 결과 · 그림',
      helper:
        '핵심 결과와 근거를 확인하세요. 결과 하이라이트나 결과 비교 인용 후보를 남기면 완료됩니다.',
      done: targetDone,
    },
    {
      id: 'deep',
      label: '3차 정독',
      scope: '방법론 · 한계 포함 전체',
      helper: template.completionLabel,
      done: deepDone,
    },
  ];
}
