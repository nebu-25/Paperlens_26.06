// 시그널 문장 스캐너 (기획서 v4.0 §8-5, FR-24) — 관점·한계·비판점 시그널 + 키워드 후보.
// 규칙 기반·결정적. AI 아님. 결과는 저장하지 않는 휘발성 안내이며,
// 사용자가 승격한 하이라이트/용어만 노트에 남는다. 순수 함수만 둔다.
import type { DetectedSection } from '../types';

// 저자 입장 표명(관점) / 저자 인정 한계(한계) / 비판적으로 볼 후보(비판점).
export type SignalType = 'limitation' | 'perspective' | 'critique';

export interface SignalMatch {
  type: SignalType;
  // paper.text 내 문장 오프셋
  start: number;
  end: number;
  // 매칭 근거 (툴팁 표시용)
  reason: string;
  // Discussion/Conclusion 구간 여부 — 표시 유지 우선순위에 사용
  emphasized: boolean;
}

export interface KeywordCandidate {
  term: string;
  count: number;
  reasons: string[];
  score: number;
}

// 문장당 하나만 매칭해도 후보로 본다. label은 근거 표시용.
const LIMITATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\blimitations?\b/i, label: 'limitation' },
  { pattern: /\bfuture (?:work|research|stud(?:y|ies))\b/i, label: 'future work' },
  { pattern: /\bremains? (?:unclear|unknown|an open question)\b/i, label: 'remains unclear' },
  { pattern: /\bbeyond the scope\b/i, label: 'beyond the scope' },
  { pattern: /\bhowever\b/i, label: 'however' },
  { pattern: /한계/, label: '한계' },
  { pattern: /제한점|제약이/, label: '제한점' },
  { pattern: /추후 연구|후속 연구|향후 연구/, label: '후속 연구' },
  { pattern: /하지 못(?:하|했|한)/, label: '…하지 못했다' },
  { pattern: /일반화(?:하기|가)? ?어렵/, label: '일반화 어려움' },
];

// 관점 시그널: 저자의 입장·주장·전제 표명 문장 (§8-5). 승격 시 '주장' 라벨로 간다.
const PERSPECTIVE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bwe (?:argue|claim|contend|posit|propose|hypothesize|believe|suggest)\b/i, label: 'we argue' },
  {
    pattern: /\bthis (?:paper|study|work|article) (?:propose|present|argue|introduce|claim)s?\b/i,
    label: 'this paper proposes',
  },
  { pattern: /\bour (?:hypothesis|claim|assumption|position|argument|thesis)\b/i, label: 'our claim' },
  { pattern: /관점에서/, label: '…관점에서' },
  { pattern: /를 전제로|을 전제로|전제한다/, label: '…를 전제로' },
  { pattern: /(?:라고|다고) (?:본다|주장한다|주장하며|가정한다)/, label: '…라고 본다' },
  { pattern: /(?:주장한다|제안한다|제안하고자|주장하고자|규명하고자)/, label: '주장/제안' },
];

// 비판점 후보: 직접 탐지 불가 → 표본/데이터 규모·가정 표명·통계 유의성 경계를 "비판적으로 볼 후보"로 표시.
const CRITIQUE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bassume(?:s|d)?\b|\bassumption\b/i, label: 'assume' },
  { pattern: /\bsample size\b|\bsmall (?:sample|dataset|number)\b|\blimited data\b/i, label: 'sample size' },
  {
    pattern: /\b(?:statistical(?:ly)? significan\w*|not significant|p\s?[<=>]\s?0?\.\d+)\b/i,
    label: 'significance',
  },
  { pattern: /가정(?:한다|하면|하고|에서|을|은|이)/, label: '가정' },
  { pattern: /표본(?:이|의|수|을|은|가)|데이터(?:셋)?(?: ?규모|가 (?:작|적))/, label: '표본/데이터 규모' },
  { pattern: /유의(?:하지 않|미하지 않|성)|통계적으로 유의/, label: '통계 유의성' },
];

// 카테고리 정의. 한 문장이 여러 카테고리에 걸리면 앞선 순서가 우선한다(한계 > 비판 > 관점).
interface SignalCategory {
  type: SignalType;
  patterns: { pattern: RegExp; label: string }[];
  reasonPrefix: string;
}
const LIMITATION_CATEGORY: SignalCategory = {
  type: 'limitation',
  patterns: LIMITATION_PATTERNS,
  reasonPrefix: '한계 시그널',
};
const ALL_CATEGORIES: SignalCategory[] = [
  LIMITATION_CATEGORY,
  { type: 'critique', patterns: CRITIQUE_PATTERNS, reasonPrefix: '비판점 후보' },
  { type: 'perspective', patterns: PERSPECTIVE_PATTERNS, reasonPrefix: '관점 시그널' },
];

// 오탐 폭주 방지 상한. 넘치면 Discussion/Conclusion 문장을 우선 보존한다.
const MAX_LIMITATION_MATCHES = 40;
const MAX_SIGNAL_MATCHES = 60;
const MIN_SENTENCE_LENGTH = 10;
const MAX_SENTENCE_LENGTH = 400;

const EMPHASIZED_SECTIONS = new Set(['Discussion', 'Conclusion']);

// 대략적 문장 분리: 종결 부호(.!?…) 뒤 공백 또는 줄바꿈을 경계로 본다.
// "91.2%" 같은 소수점은 뒤에 공백이 없어 분리되지 않는다. et al. 류 오분리는
// 휘발성 안내 특성상 허용한다.
export function splitSentences(text: string): { start: number; end: number }[] {
  const sentences: { start: number; end: number }[] = [];
  const boundary = /[.!?…]+(?=\s|$)|\n+/g;
  let cursor = 0;
  const push = (rawStart: number, rawEnd: number) => {
    let start = rawStart;
    let end = rawEnd;
    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;
    if (end > start) sentences.push({ start, end });
  };
  for (const m of text.matchAll(boundary)) {
    const index = m.index ?? 0;
    push(cursor, index + (m[0].startsWith('\n') ? 0 : m[0].length));
    cursor = index + m[0].length;
  }
  push(cursor, text.length);
  return sentences;
}

function sectionAt(sections: DetectedSection[], offset: number): string {
  let canonical = '';
  for (const s of sections) {
    if (typeof s.start !== 'number') continue;
    if (s.start <= offset) canonical = s.canonical ?? '';
    else break;
  }
  return canonical;
}

function scanCategories(
  text: string,
  sections: DetectedSection[],
  categories: SignalCategory[],
  max: number,
): SignalMatch[] {
  if (!text) return [];
  const sorted = [...sections]
    .filter((s) => typeof s.start === 'number')
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const matches: SignalMatch[] = [];
  for (const { start, end } of splitSentences(text)) {
    const length = end - start;
    if (length < MIN_SENTENCE_LENGTH || length > MAX_SENTENCE_LENGTH) continue;
    const sentence = text.slice(start, end);
    // 한 문장은 첫 매칭 카테고리 하나로만 표시(마커 겹침 방지).
    for (const category of categories) {
      const hit = category.patterns.find((p) => p.pattern.test(sentence));
      if (!hit) continue;
      matches.push({
        type: category.type,
        start,
        end,
        reason: `${category.reasonPrefix}: "${hit.label}"`,
        emphasized: EMPHASIZED_SECTIONS.has(sectionAt(sorted, start)),
      });
      break;
    }
  }
  if (matches.length <= max) return matches;
  // 상한 초과 시 Discussion/Conclusion 문장을 먼저 남기고 위치순 재정렬
  const kept = [
    ...matches.filter((m) => m.emphasized),
    ...matches.filter((m) => !m.emphasized),
  ].slice(0, max);
  return kept.sort((a, b) => a.start - b.start);
}

// 한계 시그널만 (하위 호환·단위 테스트용).
export function scanLimitationSignals(
  text: string,
  sections: DetectedSection[] = [],
): SignalMatch[] {
  return scanCategories(text, sections, [LIMITATION_CATEGORY], MAX_LIMITATION_MATCHES);
}

// 관점·한계·비판점 시그널 전체 (§8-5). pass 3 정독 안내에 사용.
export function scanSignals(text: string, sections: DetectedSection[] = []): SignalMatch[] {
  return scanCategories(text, sections, ALL_CATEGORIES, MAX_SIGNAL_MATCHES);
}

// 키워드 후보: ① 키워드 섹션 표기를 최우선 파싱 ② 약어/영문 용어 빈도 × 초록 등장 가중.
// 순한글 전문용어는 규칙으로 잡기 어렵다는 한계를 유지한다 (§8-2).
const KEYWORD_SECTION_PATTERN =
  /(?:키워드|주제어|핵심어|Key\s?words?)\s*[:：]\s*([^\n]{2,200})/i;

const TERM_PATTERN = /\b[A-Z]{2,}\b|\b[A-Z][a-zA-Z]+(?:-[A-Z][a-zA-Z]+)*\b/g;

const STOPWORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'There', 'Then', 'Thus', 'When', 'While',
  'Where', 'Which', 'With', 'Without', 'From', 'For', 'And', 'But', 'Not', 'Our',
  'However', 'Although', 'Because', 'Therefore', 'Moreover', 'Furthermore', 'Finally',
  'First', 'Second', 'Third', 'Figure', 'Table', 'Section', 'Appendix', 'Equation',
  'Abstract', 'Introduction', 'Method', 'Methods', 'Results', 'Result', 'Discussion',
  'Conclusion', 'Conclusions', 'References', 'Acknowledgments', 'Keywords',
  'In', 'On', 'At', 'To', 'Of', 'As', 'By', 'An', 'We', 'It', 'Is', 'Are', 'Was', 'Were',
]);

const MAX_KEYWORD_CANDIDATES = 8;

export function buildKeywordCandidates(
  text: string,
  sections: DetectedSection[] = [],
  existingTerms: string[] = [],
): KeywordCandidate[] {
  if (!text) return [];
  const existing = new Set(existingTerms.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const candidates: KeywordCandidate[] = [];
  const take = (candidate: KeywordCandidate) => {
    const key = candidate.term.toLowerCase();
    if (existing.has(key) || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  // ① 논문의 키워드 섹션 표기 (최우선)
  const sectionMatch = text.slice(0, 4000).match(KEYWORD_SECTION_PATTERN);
  if (sectionMatch) {
    for (const raw of sectionMatch[1].split(/[,;·、/]+/)) {
      const term = raw.trim().replace(/[.。]+$/, '');
      if (term.length < 2 || term.length > 40) continue;
      take({ term, count: 1, reasons: ['논문 키워드 섹션'], score: 100 });
      if (candidates.length >= MAX_KEYWORD_CANDIDATES) return candidates;
    }
  }

  // ② 약어·영문 용어: 빈도 + 초록(서론 이전) 등장 가중
  const introStart = sections.find((s) => s.canonical === 'Introduction')?.start;
  const abstractEnd =
    typeof introStart === 'number' && introStart > 0
      ? introStart
      : Math.min(1500, text.length);
  const counts = new Map<string, { count: number; firstIndex: number }>();
  for (const m of text.matchAll(TERM_PATTERN)) {
    const term = m[0];
    if (term.length < 2 || STOPWORDS.has(term)) continue;
    const entry = counts.get(term);
    if (entry) entry.count += 1;
    else counts.set(term, { count: 1, firstIndex: m.index ?? 0 });
  }
  const scored = [...counts.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([term, v]) => {
      const isAcronym = /^[A-Z]{2,}$/.test(term);
      const inAbstract = v.firstIndex < abstractEnd;
      const reasons = [`본문 ${v.count}회`];
      if (isAcronym) reasons.push('약어');
      if (inAbstract) reasons.push('초록 등장');
      return {
        term,
        count: v.count,
        reasons,
        score: v.count + (isAcronym ? 2 : 0) + (inAbstract ? 3 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count);
  for (const candidate of scored) {
    if (candidates.length >= MAX_KEYWORD_CANDIDATES) break;
    take(candidate);
  }
  return candidates;
}
