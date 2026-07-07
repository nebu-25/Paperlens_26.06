// 연구 질문 빌더 (기획서 v4.0 §8-8, FR-28) — 프로젝트 레벨, per-paper 노트와 분리.
// 프레임·질문은 선언적 데이터이고 답·판단은 사용자가 채운다. AI 미사용(코어).
export type FrameId = 'finer' | 'picot' | 'pesico';

export interface FrameSlot {
  key: string;
  label: string;
  helper: string;
  placeholder: string;
}

export interface FrameDef {
  id: FrameId;
  name: string;
  tagline: string;
  slots: FrameSlot[];
}

export const RESEARCH_FRAMES: FrameDef[] = [
  {
    id: 'finer',
    name: 'FINER (기본·범용)',
    tagline: '질문이 추진할 가치가 있는지 점검하는 기준.',
    slots: [
      {
        key: 'feasible',
        label: 'Feasible — 실행 가능한가?',
        helper: '표본·시간·비용·기술로 수행 가능한 범위인지.',
        placeholder: '확보 가능한 데이터, 표본 수, 기간, 도구, 분석 역량을 기준으로 실제 수행 범위를 적어보세요.',
      },
      {
        key: 'interesting',
        label: 'Interesting — 흥미로운가?',
        helper: '나와 예상 독자에게 궁금증을 일으키는지.',
        placeholder: '취합한 관점·한계 중 계속 설명이 필요해 보이는 지점을 질문 형태로 적어보세요.',
      },
      {
        key: 'novel',
        label: 'Novel — 새로운가?',
        helper: '취합된 한계·공백에 비추어 무엇이 새로운지.',
        placeholder: '선행연구가 반복해서 다루지 못한 대상, 조건, 방법, 맥락을 기준으로 새로움을 정리하세요.',
      },
      {
        key: 'ethical',
        label: 'Ethical — 윤리적인가?',
        helper: 'IRB·데이터 활용 등 윤리 제약을 통과하는지.',
        placeholder: '개인정보, 연구대상자 보호, 공개 데이터 사용 조건처럼 먼저 확인해야 할 윤리 제약을 적어보세요.',
      },
      {
        key: 'relevant',
        label: 'Relevant — 유의미한가?',
        helper: '분야·실무·후속 연구에 어떤 도움이 되는지.',
        placeholder: '이 질문에 답했을 때 연구 분야, 실무, 정책, 후속 연구에 생기는 구체적 쓸모를 적어보세요.',
      },
    ],
  },
  {
    id: 'picot',
    name: 'PICOT (임상·중재)',
    tagline: '임상·중재 연구 질문의 구성 요소.',
    slots: [
      {
        key: 'population',
        label: 'Population — 대상',
        helper: '누구를 대상으로 하는가.',
        placeholder: '대상 집단의 조건, 제외 기준, 규모, 배경 특성을 가능한 한 좁혀 적어보세요.',
      },
      {
        key: 'intervention',
        label: 'Intervention — 중재',
        helper: '어떤 중재/노출을 다루는가.',
        placeholder: '검토할 중재, 노출, 프로그램, 처치의 핵심 요소와 적용 방식을 적어보세요.',
      },
      {
        key: 'comparison',
        label: 'Comparison — 비교',
        helper: '무엇과 비교하는가 (대조군·표준치료 등).',
        placeholder: '대조군, 기존 방법, 표준치료, 무처치 등 비교 기준을 명확히 적어보세요.',
      },
      {
        key: 'outcome',
        label: 'Outcome — 결과',
        helper: '어떤 결과 지표로 판정하는가.',
        placeholder: '효과를 판단할 주요 결과 지표와 측정 방식, 기대 변화 방향을 적어보세요.',
      },
      {
        key: 'time',
        label: 'Time — 기간',
        helper: '어느 기간에 걸쳐 관찰하는가.',
        placeholder: '중재 적용 기간, 추적 관찰 시점, 결과 측정 시점을 구분해 적어보세요.',
      },
    ],
  },
  {
    id: 'pesico',
    name: 'PESICO (중재·의사소통)',
    tagline: '환경·이해관계자까지 넓히는 중재 질문 구성.',
    slots: [
      {
        key: 'person',
        label: 'Person — 사람',
        helper: '중심이 되는 사람/집단.',
        placeholder: '중심 사용자, 환자, 참여자, 조직 구성원의 특성과 문제 상황을 적어보세요.',
      },
      {
        key: 'environments',
        label: 'Environments — 환경',
        helper: '어떤 환경·맥락에서 일어나는가.',
        placeholder: '병원, 학교, 지역사회, 온라인 플랫폼처럼 결과가 달라질 수 있는 맥락을 적어보세요.',
      },
      {
        key: 'stakeholders',
        label: 'Stakeholders — 이해관계자',
        helper: '결과에 영향을 받는/주는 사람들.',
        placeholder: '사용자 외에 보호자, 전문가, 기관, 정책 담당자 등 영향을 주고받는 주체를 적어보세요.',
      },
      {
        key: 'intervention',
        label: 'Intervention — 중재',
        helper: '어떤 중재를 검토하는가.',
        placeholder: '도입하려는 교육, 도구, 시스템, 커뮤니케이션 방식의 핵심 작동 방식을 적어보세요.',
      },
      {
        key: 'comparison',
        label: 'Comparison — 비교',
        helper: '무엇과 비교하는가.',
        placeholder: '기존 절차, 다른 환경, 다른 이해관계자 조건 등 비교할 기준을 적어보세요.',
      },
      {
        key: 'outcomes',
        label: 'Outcomes — 결과',
        helper: '어떤 결과를 기대/측정하는가.',
        placeholder: '행동 변화, 만족도, 접근성, 안전성, 성과 지표처럼 확인할 결과를 적어보세요.',
      },
    ],
  },
];

export const DEFAULT_FRAME_ID: FrameId = 'finer';

export function resolveFrame(id?: string): FrameDef {
  return RESEARCH_FRAMES.find((f) => f.id === id) ?? RESEARCH_FRAMES[0];
}

// 질의 확장 질문 (§8-8 흐름 3) — 기본 접힘, 필요 시 펼쳐 질문 생성을 돕는다.
export const EXPANSION_QUESTIONS: { key: string; label: string; placeholder: string }[] = [
  {
    key: 'expected',
    label: '진행하려는 주제·연구에서 나올 수 있는 결과는 무엇인가?',
    placeholder: '아직 확신이 없어도 괜찮습니다. 이 연구를 해 보면 어떤 결과가 나올 수 있을지 여러 가능성을 편하게 적어보세요.',
  },
  {
    key: 'audience',
    label: '예상 독자에게 이 결과가 중요한가?',
    placeholder: '이 연구 결과를 알게 되면 도움이 될 사람을 떠올려 보세요. 연구자, 실무자, 기관, 사용자 중 누가 왜 관심을 가질지 적어보세요.',
  },
  {
    key: 'field',
    label: '기존 연구 분야에 새 도움이 되는가? 다른 연구자에게 도움이 되는가?',
    placeholder: '선행연구를 모두 이해하지 못했어도 괜찮습니다. 지금까지 읽은 자료와 비교해 내 질문이 무엇을 조금 더 보탤 수 있을지 적어보세요.',
  },
  {
    key: 'contribution',
    label: '이 연구는 기존 지식을 무효화하는가, 확증·일반화하는가, 새 정보를 도출하는가?',
    placeholder: '내 연구가 할 일을 한 문장으로 상상해 보세요. 기존 설명을 확인하는지, 다른 상황에 넓혀 보는지, 비어 있던 정보를 채우는지 적어보세요.',
  },
];

// 프로젝트 문서 (사용자별 단일 문서 — localStorage 캐시 + 서버 동기화 §13)
export interface ResearchQuestionDoc {
  frameId: FrameId;
  // 취합 재료에서 본 연구 공백 메모
  gapNote: string;
  // frameId별 슬롯 답변: frameId -> slotKey -> 답변 (프레임 전환 시 답 보존)
  slots: Record<string, Record<string, string>>;
  expansion: Record<string, string>;
  // 마지막 수정 시각 (last-write-wins 비교용)
  updatedAt?: string;
}

export const EMPTY_RESEARCH_DOC: ResearchQuestionDoc = {
  frameId: DEFAULT_FRAME_ID,
  gapNote: '',
  slots: {},
  expansion: {},
};

const stringMap = (raw: unknown): Record<string, string> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
};

export function normalizeResearchDoc(raw: unknown): ResearchQuestionDoc {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_RESEARCH_DOC };
  const data = raw as Partial<ResearchQuestionDoc> & { slots?: unknown; expansion?: unknown };
  const slots: Record<string, Record<string, string>> = {};
  if (data.slots && typeof data.slots === 'object' && !Array.isArray(data.slots)) {
    for (const [frameId, answers] of Object.entries(data.slots as Record<string, unknown>)) {
      slots[frameId] = stringMap(answers);
    }
  }
  return {
    frameId: RESEARCH_FRAMES.some((f) => f.id === data.frameId)
      ? (data.frameId as FrameId)
      : DEFAULT_FRAME_ID,
    gapNote: typeof data.gapNote === 'string' ? data.gapNote : '',
    slots,
    expansion: stringMap(data.expansion),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

// last-write-wins: 로컬과 서버 문서 중 최근 수정본을 고른다. 시각이 없으면 상대가 이긴다.
export function pickNewerDoc(
  local: ResearchQuestionDoc,
  server: ResearchQuestionDoc,
): ResearchQuestionDoc {
  const localTime = Date.parse(local.updatedAt ?? '') || 0;
  const serverTime = Date.parse(server.updatedAt ?? '') || 0;
  return serverTime >= localTime ? server : local;
}

// 연구 질문 문서 Markdown (FS-11 출력)
export function buildResearchMarkdown(doc: ResearchQuestionDoc): string {
  const frame = resolveFrame(doc.frameId);
  const out: string[] = ['# 연구 질문 문서', ''];
  out.push(`- 프레임: ${frame.name}`);
  out.push(`- 내보낸 날짜: ${new Date().toLocaleString('ko-KR')}`, '');
  if (doc.gapNote.trim()) {
    out.push('## 연구 공백 메모', '', doc.gapNote.trim(), '');
  }
  const answers = doc.slots[frame.id] ?? {};
  out.push(`## ${frame.name}`, '');
  for (const slot of frame.slots) {
    const answer = (answers[slot.key] ?? '').trim();
    out.push(`### ${slot.label}`, '', answer || '_(미작성)_', '');
  }
  const expansionAnswered = EXPANSION_QUESTIONS.filter(
    (q) => (doc.expansion[q.key] ?? '').trim(),
  );
  if (expansionAnswered.length) {
    out.push('## 질의 확장', '');
    for (const q of expansionAnswered) {
      out.push(`### ${q.label}`, '', doc.expansion[q.key].trim(), '');
    }
  }
  return out.join('\n');
}
