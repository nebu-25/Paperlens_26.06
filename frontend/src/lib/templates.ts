// 읽기 목적 템플릿 (기획서 v4.0 §8-3a, FR-19) — 선언적 정의만 모은 순수 모듈.
// 목적(왜 읽는가)이 질문·권장 라벨·완료 기준을 정하고, 깊이(얼마나 읽는가)는
// lib/readingRoadmap.ts의 3-pass 로드맵이 담당한다.
import { TEMPLATE_QUESTIONS } from '../constants';
import type { HighlightColor, ReviewNote } from '../types';

export type PurposeTemplateId =
  | 't1_general'
  | 't2_related'
  | 't3_method'
  | 't4_critical'
  | 't5_results';

export const DEFAULT_TEMPLATE_ID: PurposeTemplateId = 't1_general';

export interface PurposeQuestion {
  key: string;
  label: string;
  helper?: string;
  placeholder?: string;
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
  // 내보내기 기본 포함 항목 (FR-21). lib/export.ts의 ExportOptions와 구조 동일
  // (export.ts가 이 모듈을 import하므로 순환 의존을 피해 여기서 중복 선언).
  exportDefaults: {
    template: boolean;
    terms: boolean;
    questions: boolean;
    highlights: boolean;
    citationBoard: boolean;
    figures: boolean;
  };
}

const answered = (value?: string) => (value ?? '').trim().length > 0;

const countColor = (note: ReviewNote, color: HighlightColor) =>
  note.highlights.filter((h) => (h.color ?? 'yellow') === color).length;

// 인용 후보 보드에 분류된 항목 수 (하이라이트 + 수동 요약, 제안 포함 — 보드 기준과 동일)
const citationItemCount = (note: ReviewNote) =>
  note.highlights.filter((h) => h.citationUse).length
  + note.manualSummaries.filter((m) => m.citationUse).length;

const hasCitationUse = (note: ReviewNote, use: string) =>
  note.highlights.some((h) => h.citationUse === use)
  || note.manualSummaries.some((m) => m.citationUse === use);

const T1_GENERAL: PurposeTemplateDef = {
  id: 't1_general',
  name: 'T1 일반 리뷰',
  tagline: '정독 여부 판단과 뼈대 파악. 목적이 정해지지 않았을 때의 기본 리뷰.',
  focus: '키워드',
  recommendedColors: ['yellow', 'blue'],
  // 기존 5문항(q1~q5)을 그대로 승계 — 답변은 하위 호환을 위해 note.template에 저장한다.
  // 관련 라벨(FR-22): 무엇을 해결→주장, 방법→방법론, 결과→결과, 한계→한계/비판.
  questions: TEMPLATE_QUESTIONS.map((q, index) => ({
    key: q.key,
    label: q.label,
    relatedColors: ([['yellow'], ['green'], ['blue'], ['pink'], []] as HighlightColor[][])[index],
  })),
  completionLabel: '5문항을 모두 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) => TEMPLATE_QUESTIONS.every((q) => answered(note.template[q.key])),
  exportDefaults: { template: true, terms: true, questions: true, highlights: true, citationBoard: true, figures: true },
};

const T2_RELATED: PurposeTemplateDef = {
  id: 't2_related',
  name: 'T2 선행연구 정리',
  tagline: '내 논문의 서론·선행연구 절에 인용할 재료 수집. Related Work 집필 준비.',
  focus: '키워드 · 관점',
  recommendedColors: ['yellow', 'violet'],
  questions: [
    {
      key: 'q1',
      label: '이 논문이 내 연구와 어떻게 연결되나?',
      helper: '주제·이론·방법 어느 축에서 내 연구와 만나는지.',
      placeholder: '관련 하이라이트 버튼을 통해 관련 정보를 따로 모아 확인하며 정리할 수 있습니다.',
      relatedColors: ['yellow'],
    },
    {
      key: 'q2',
      label: '내 논문에서 이 논문을 한 문장으로 소개한다면?',
      helper: '서론에 그대로 옮길 수 있는 한 문장을 미리 써 두세요.',
      placeholder: '전제 조건이나, 연구 주제 전반으로 존재하는 한계 등 서론에 적힐 적절한 내용을 정리하세요.',
    },
    {
      key: 'q3',
      label: '내 연구와의 차별점은?',
      helper: '이 논문이 하지 않은 것, 내 연구가 새로 하는 것.',
      placeholder: '연구 대상, 조건, 접근 방식 가운데 내 연구가 새롭게 가져가는 지점을 분리해서 적어 보세요.',
      relatedColors: ['yellow', 'violet'],
    },
    {
      key: 'q4',
      label: '어떤 맥락(전제·비교·반론)에서 인용할 것인가?',
      helper: '하이라이트에 인용 목적을 붙이면 인용 후보 보드에 분류됩니다.',
      placeholder: '배경 설명용인지, 결과 비교용인지, 반론 제시용인지처럼 실제 문장에 들어갈 인용 맥락을 정리하세요.',
      relatedColors: ['violet'],
    },
  ],
  completionLabel:
    '인용 후보 1개 이상 + "한 문장 소개" 답변을 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) =>
    citationItemCount(note) >= 1 && answered(note.templateAnswers?.t2_related?.q2),
  // 출력은 인용 후보 보드 중심 (§8-3a T2)
  exportDefaults: { template: true, terms: false, questions: false, highlights: true, citationBoard: true, figures: false },
};

const T3_METHOD: PurposeTemplateDef = {
  id: 't3_method',
  name: 'T3 방법론 벤치마킹',
  tagline: '연구 설계·실험·분석 방법을 내 연구에 이식하거나 비교하는 읽기.',
  focus: '방법 · 한계(방법의 취약점)',
  recommendedColors: ['green'],
  questions: [
    {
      key: 'q1',
      label: '연구 설계는? (대상·표본·조건)',
      helper: '누구/무엇을 대상으로, 어떤 조건에서 수행했는지.',
      placeholder: '대상, 표본 수, 실험 조건처럼 연구 설계를 다시 재현할 때 먼저 필요한 정보를 정리하세요.',
      relatedColors: ['green'],
    },
    {
      key: 'q2',
      label: '핵심 절차·도구·지표는?',
      helper: '재현에 필요한 구체 절차와 측정 지표.',
      placeholder: '실험 순서, 사용한 도구, 평가 지표를 단계별로 적어 두면 나중에 같은 흐름으로 옮기기 쉽습니다.',
      relatedColors: ['green'],
    },
    {
      key: 'q3',
      label: '내 상황에 적용 시 바꿔야 할 것은?',
      helper: '내 데이터·환경 기준으로 그대로 쓸 수 없는 부분.',
      placeholder: '내 데이터, 장비, 참여자 조건에 맞추려면 무엇을 수정해야 하는지 적용 계획 중심으로 적어 보세요.',
      relatedColors: ['green'],
    },
    {
      key: 'q4',
      label: '이 방법의 전제 조건과 취약점은?',
      helper: '이 방법이 성립하기 위한 가정과 깨지기 쉬운 지점.',
      placeholder: '이 방법이 잘 작동하려면 무엇이 전제되어야 하는지, 어디서 쉽게 흔들리는지 나눠서 적어 보세요.',
      relatedColors: ['green', 'pink'],
    },
  ],
  completionLabel:
    '방법론 하이라이트 3개 이상 + 적용 계획(③) 답변을 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) =>
    countColor(note, 'green') >= 3 && answered(note.templateAnswers?.t3_method?.q3),
  exportDefaults: { template: true, terms: true, questions: true, highlights: true, citationBoard: false, figures: true },
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
      placeholder: '저자가 무엇을 당연하게 전제하는지, 어떤 관점으로 문제를 정의하는지 문장으로 풀어 적어 보세요.',
      relatedColors: ['yellow'],
    },
    {
      key: 'q2',
      label: '저자가 인정한 한계는?',
      helper: 'Discussion/Conclusion에서 저자가 직접 언급한 제한점.',
      placeholder: 'Discussion이나 Conclusion에서 저자가 스스로 인정한 제한점을 그대로 요약해 두세요.',
      relatedColors: ['pink'],
    },
    {
      key: 'q3',
      label: '저자가 말하지 않은 한계는?',
      helper: '표본 규모, 가정, 일반화 범위 등 본문이 침묵하는 약점.',
      placeholder: '표본, 데이터, 가정, 일반화 범위처럼 본문이 충분히 설명하지 않은 약점을 직접 적어 보세요.',
      relatedColors: ['pink', 'orange'],
    },
    {
      key: 'q4',
      label: '주장-근거 사슬에서 가장 약한 고리는?',
      helper: '어떤 근거가 무너지면 주장 전체가 흔들리는지.',
      placeholder: '주장과 근거가 이어지는 흐름에서 가장 설득력이 약한 지점이 어디인지 짚어 보세요.',
      relatedColors: ['violet', 'yellow'],
    },
    {
      key: 'q5',
      label: '결과가 성립하지 않는 조건은?',
      helper: '다른 데이터·환경·전제에서도 같은 결과가 나올지.',
      placeholder: '데이터나 환경이 바뀌면 이 결과가 유지되지 않을 조건이 무엇인지 가정해서 적어 보세요.',
      relatedColors: ['blue', 'orange'],
    },
  ],
  completionLabel:
    '한계/비판 하이라이트 2개 이상 + "말하지 않은 한계" 답변을 작성하면 정독 단계가 완료됩니다.',
  isComplete: (note) =>
    countColor(note, 'pink') >= 2 && answered(note.templateAnswers?.t4_critical?.q3),
  // 발제·반론 구성에 필요한 질문·하이라이트·인용 후보 중심. 용어 사전은 선택.
  exportDefaults: { template: true, terms: false, questions: true, highlights: true, citationBoard: true, figures: true },
};

const T5_RESULTS: PurposeTemplateDef = {
  id: 't5_results',
  name: 'T5 결과 비교·수치 수집',
  tagline: '성능표·효과크기 등 내 결과와 비교할 수치를 수집하는 읽기.',
  focus: '결과',
  recommendedColors: ['blue'],
  questions: [
    {
      key: 'q1',
      label: '비교 대상 지표와 값은?',
      helper: '표·그림에서 내 결과와 비교할 수치를 그대로 옮겨 적으세요.',
      placeholder: '비교할 지표 이름과 수치를 표나 그림에서 바로 옮겨 적고, 어느 조건에서 나온 값인지 함께 남기세요.',
      relatedColors: ['blue'],
    },
    {
      key: 'q2',
      label: '실험 조건이 내 것과 같은가, 다른가?',
      helper: '데이터셋·표본·환경 차이를 기록하세요.',
      placeholder: '데이터셋, 표본, 실험 환경이 내 연구와 어떻게 같은지 다른지 비교 기준 위주로 정리하세요.',
      relatedColors: ['green', 'blue'],
    },
    {
      key: 'q3',
      label: '직접 비교 가능한가, 보정이 필요한가?',
      helper: '조건 차이 때문에 수치를 그대로 비교할 수 없다면 보정 방법을 적으세요.',
      placeholder: '조건이 달라 수치를 그대로 비교하기 어렵다면 어떤 보정이나 해석 주의가 필요한지 적어 두세요.',
      relatedColors: ['blue'],
    },
  ],
  completionLabel: '"결과 비교" 인용 후보를 1개 이상 남기면 정독 단계가 완료됩니다.',
  isComplete: (note) => hasCitationUse(note, 'comparison'),
  exportDefaults: { template: true, terms: false, questions: false, highlights: true, citationBoard: true, figures: true },
};

export const PURPOSE_TEMPLATES: PurposeTemplateDef[] = [
  T1_GENERAL,
  T2_RELATED,
  T3_METHOD,
  T4_CRITICAL,
  T5_RESULTS,
];

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
