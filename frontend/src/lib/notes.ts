// 노트/논문 데이터 유틸. 순수 함수만 모은다(React·DOM 비의존).
import { SUMMARY_SECTIONS } from '../constants';
import type { DetectedSection, Paper, ReviewNote, SectionSummary, Source } from '../types';

export const uid = () => Math.random().toString(36).slice(2, 9);
export const fileSourceKey = (file: File) => `file:${file.name}:${file.size}:${file.lastModified}`;

export const defaultSectionSummaries = (): SectionSummary[] =>
  SUMMARY_SECTIONS.map((section) => ({
    id: uid(),
    section,
    content: '',
    source: 'user' as Source,
  }));

// 요약 카드에 쓰지 않는 섹션(본문 요약 대상이 아님).
const NON_SUMMARY_SECTIONS = new Set(['References', 'Acknowledgments', 'Appendix']);

// 자동 감지된 섹션(#6)에서 요약 카드로 쓸 카테고리명을 등장 순서대로 추린다.
// 정규화 카테고리(canonical)만, 중복·비요약 섹션 제외. 2개 미만이면 빈 배열.
export function detectedSectionNames(sections?: DetectedSection[]): string[] {
  if (!sections?.length) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const s of sections) {
    const name = s.canonical;
    if (!name || NON_SUMMARY_SECTIONS.has(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names.length >= 2 ? names : [];
}

// 감지된 섹션으로 섹션별 요약 카드를 구성한다. 충분히 감지되지 않으면 기본 섹션으로 폴백.
export function sectionSummariesFromDetected(sections?: DetectedSection[]): SectionSummary[] {
  const names = detectedSectionNames(sections);
  if (!names.length) return defaultSectionSummaries();
  return names.map((section) => ({ id: uid(), section, content: '', source: 'user' as Source }));
}

export const EMPTY_NOTE: ReviewNote = {
  oneLineSummary: '',
  oneLineSource: 'user',
  summaryMode: 'section',
  tags: [],
  sectionSummaries: defaultSectionSummaries(),
  highlights: [],
  manualSummaries: [],
  terms: [],
  questions: [],
  template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
  memos: {},
};

// 저장된(옛 스키마 포함) 노트를 현재 스키마로 보정 — sectionSummaries 누락 시 기본 섹션 채움
export function normalizeNote(raw: Partial<ReviewNote>): ReviewNote {
  return {
    ...EMPTY_NOTE,
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
    manualSummaries: Array.isArray(raw.manualSummaries) ? raw.manualSummaries : [],
    terms: Array.isArray(raw.terms) ? raw.terms : [],
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    sectionSummaries:
      Array.isArray(raw.sectionSummaries) && raw.sectionSummaries.length > 0
        ? raw.sectionSummaries
        : defaultSectionSummaries(),
  };
}

// 지식베이스 검색 대상 텍스트: 메타·태그·작성 내용 전체를 합쳐 소문자로 만든다.
export function searchableText(paper: Paper, note: ReviewNote): string {
  const parts: string[] = [
    paper.title,
    paper.authors,
    paper.link,
    paper.doi ?? '',
    (paper.suggestedTags ?? []).join(' '),
    (note.tags ?? []).join(' '),
    note.oneLineSummary,
  ];
  for (const s of note.sectionSummaries ?? []) parts.push(s.section, s.content);
  for (const item of note.manualSummaries ?? []) parts.push(item.text);
  parts.push(...Object.values(note.template ?? {}));
  for (const t of note.terms ?? []) parts.push(t.term, t.explanation);
  for (const q of note.questions ?? []) parts.push(q.text);
  for (const h of note.highlights ?? []) parts.push(h.text);
  parts.push(...Object.values(note.memos ?? {}));
  return parts.join(' ').toLowerCase();
}

export function mergeTags(current: string[], suggested: string[] = []): string[] {
  const seen = new Set(current.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  const next = current.filter((tag) => tag.trim());
  for (const raw of suggested) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}
