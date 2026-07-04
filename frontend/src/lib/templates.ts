// 읽기 목적 템플릿 (기획서 v4.0 §8-3a, FR-19) — 선언적 정의만 모은 순수 모듈.
// 목적(왜 읽는가)이 질문·권장 라벨·완료 기준을 정하고, 깊이(얼마나 읽는가)는
// lib/readingRoadmap.ts의 3-pass 로드맵이 담당한다.
import { TEMPLATE_QUESTIONS } from '../constants';
import type { HighlightColor, ReviewNote } from '../types';

// M1은 T1/T4만 출시한다. T2(선행연구)/T3(방법론)/T5(수치 비교)는 M3에서 추가.
export type PurposeTemplateId = 't1_general' | 't4_critical';

export const DEFAULT_TEMPLATE_ID: PurposeTemplateId = 't1_general';

export interface PurposeQuestion {
  key: string;
  label: string;
  helper?: string;
  // 이 질문과 관련된 하이라이트 라벨. M3의 질문 카드 ↔ 라벨 필터 연동에 사용.
  relatedColors?: HighlightColor[];
}

export interface PurposeTemplateDef {
  id: PurposeTemplateId;
  name: string;
  // 선택 UI에 보여줄 목적 한 줄
  tagline: string;
  // 주 발굴 요소 (키워드·관점·한계·비판 중 이 목적이 주로 캐는 것)
  focus: string;
  recommendedColors: HighlightColor[];
  questions: PurposeQuestion[];
  // 3-pass 로드맵의 정독(pass 3) 완료 기준 설명과 판정
  completionLabel: string;
  isComplete: (note: ReviewNote) => boolean;
}

const answered = (value?: string) => (value ?? '').trim().length > 0;

const countColor = (note: ReviewNote, color: HighlightColor) =>
  note.highlights.filter((h) => (h.color ?? 'yellow') === color).length;

const T1_GENERAL: PurposeTemplateDef = {
  id: 't1_general',
  name: 'T1 일반 리뷰',
  tagline: '정독 여부 판단과 뼈대 파악. 목적이 정해지지 않았을 때의 기본 리뷰.',
  focus: '키워드',
  recommendedColors: ['yellow', 'blue'],
  // 기존 5문항(q1~q5)을 그대로 승계 — 답변은 하위 호환을 위해 note.template에 저장한다.
  questions: TEMPLATE_QUESTIONS.map((q) => ({ key: q.key, label: q.label })),
  completionLabel: '5문항을 모두 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) => TEMPLATE_QUESTIONS.every((q) => answered(note.template[q.key])),
};

const T4_CRITICAL: PurposeTemplateDef = {
  id: 't4_critical',
  name: 'T4 비판적 검토',
  tagline: '세미나 발제·리뷰·반론 구성. 관점·한계·비판점을 캐며 뜯어보는 읽기.',
  focus: '관점 · 한계 · 비판',
  recommendedColors: ['pink', 'orange', 'violet'],
  questions: [
    {
      key: 'q1',
      label: '저자의 관점/전제는 무엇인가?',
      helper: '문제를 바라보는 프레임, 암묵적 가정을 적어 보세요.',
      relatedColors: ['yellow'],
    },
    {
      key: 'q2',
      label: '저자가 인정한 한계는?',
      helper: 'Discussion/Conclusion에서 저자가 직접 언급한 제한점.',
      relatedColors: ['pink'],
    },
    {
      key: 'q3',
      label: '저자가 말하지 않은 한계는?',
      helper: '표본 규모, 가정, 일반화 범위 등 본문이 침묵하는 약점.',
      relatedColors: ['pink', 'orange'],
    },
    {
      key: 'q4',
      label: '주장-근거 사슬에서 가장 약한 고리는?',
      helper: '어떤 근거가 무너지면 주장 전체가 흔들리는지.',
      relatedColors: ['violet', 'yellow'],
    },
    {
      key: 'q5',
      label: '결과가 성립하지 않는 조건은?',
      helper: '다른 데이터·환경·전제에서도 같은 결과가 나올지.',
      relatedColors: ['blue', 'orange'],
    },
  ],
  completionLabel:
    '한계/비판 하이라이트 2개 이상 + "말하지 않은 한계" 답변을 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) =>
    countColor(note, 'pink') >= 2 && answered(note.templateAnswers?.t4_critical?.q3),
};

export const PURPOSE_TEMPLATES: PurposeTemplateDef[] = [T1_GENERAL, T4_CRITICAL];

export function isPurposeTemplateId(id?: string): id is PurposeTemplateId {
  return PURPOSE_TEMPLATES.some((t) => t.id === id);
}

// 알 수 없는 id(미래 템플릿·손상 데이터)는 T1으로 폴백한다 (FS-06 예외 규칙).
export function resolvePurposeTemplate(id?: string): PurposeTemplateDef {
  return PURPOSE_TEMPLATES.find((t) => t.id === id) ?? T1_GENERAL;
}

// 활성 템플릿의 문항 답변 맵. T1은 하위 호환을 위해 기존 note.template을 읽고,
// 그 외 템플릿은 note.templateAnswers[templateId]를 읽는다.
export function getPurposeAnswers(
  note: ReviewNote,
  templateId: PurposeTemplateId,
): Record<string, string> {
  if (templateId === 't1_general') return note.template;
  return note.templateAnswers?.[templateId] ?? {};
}
