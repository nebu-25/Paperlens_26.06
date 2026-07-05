// 라이브러리 취합 (기획서 v4.0 §8-6, FR-25) — 순수 함수만 둔다.
// 논문을 찾아 주는 탐색이 아니라, 사용자가 분류해 둔 것(라벨·인용 목적)의 집계다.
// 연구 질문 빌더(§8-8)의 입력 재료가 된다.
import { CITATION_USE_OPTIONS, HIGHLIGHT_COLORS } from '../constants';
import type { CitationUse, HighlightColor, Paper, ReviewNote } from '../types';

export interface AggregatedItem {
  paperId: string;
  paperTitle: string;
  paperAuthors: string;
  source: 'highlight' | 'manual';
  // 원본 노트 항목 id (하이라이트 또는 수동 요약) — 역링크용
  itemId: string;
  text: string;
  color: HighlightColor;
  citationUse?: CitationUse;
  citationSuggested?: boolean;
}

export interface AggregateFilter {
  color: HighlightColor | 'all';
  use: CitationUse | 'all';
}

export const AGGREGATE_ALL: AggregateFilter = { color: 'all', use: 'all' };

// 라이브러리 전체의 하이라이트·수동 요약을 출처(논문)와 함께 평탄화한다.
export function aggregateLibrary(
  library: Record<string, Paper>,
  notes: Record<string, ReviewNote>,
): AggregatedItem[] {
  const items: AggregatedItem[] = [];
  for (const [paperId, paper] of Object.entries(library)) {
    const note = notes[paperId];
    if (!note) continue;
    const paperTitle = paper.title || '제목 없음';
    const paperAuthors = paper.authors || '';
    for (const h of note.highlights ?? []) {
      items.push({
        paperId,
        paperTitle,
        paperAuthors,
        source: 'highlight',
        itemId: h.id,
        text: h.text,
        color: h.color ?? 'yellow',
        citationUse: h.citationUse,
        citationSuggested: h.citationSuggested,
      });
    }
    for (const m of note.manualSummaries ?? []) {
      items.push({
        paperId,
        paperTitle,
        paperAuthors,
        source: 'manual',
        itemId: m.id,
        text: m.text,
        color: m.color,
        citationUse: m.citationUse,
        citationSuggested: m.citationSuggested,
      });
    }
  }
  return items;
}

export function filterAggregated(items: AggregatedItem[], filter: AggregateFilter): AggregatedItem[] {
  return items.filter(
    (item) =>
      (filter.color === 'all' || item.color === filter.color)
      && (filter.use === 'all' || item.citationUse === filter.use),
  );
}

// 연구 질문 빌더 재료 (§8-8 흐름 1): 키워드(용어), 관점(주장), 한계, 비판·질문
export interface BuilderMaterials {
  keywords: string[];
  perspectives: AggregatedItem[]; // 주장(yellow)
  limitations: AggregatedItem[]; // 한계/비판(pink)
  critiques: AggregatedItem[]; // 질문/후속 확인(orange)
}

export function collectBuilderMaterials(
  library: Record<string, Paper>,
  notes: Record<string, ReviewNote>,
): BuilderMaterials {
  const items = aggregateLibrary(library, notes);
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const note of Object.values(notes)) {
    for (const term of note.terms ?? []) {
      const key = term.term.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keywords.push(term.term.trim());
    }
  }
  return {
    keywords,
    perspectives: items.filter((i) => i.color === 'yellow'),
    limitations: items.filter((i) => i.color === 'pink'),
    critiques: items.filter((i) => i.color === 'orange'),
  };
}

const colorLabel = (color: HighlightColor) =>
  HIGHLIGHT_COLORS.find((c) => c.value === color)?.meaning ?? color;

const citationUseLabel = (use?: CitationUse) =>
  CITATION_USE_OPTIONS.find((o) => o.value === use)?.label;

// 취합 Markdown (논문별 그룹, 출처 표기) — 선행연구 절 초안의 재료
export function buildAggregateMarkdown(items: AggregatedItem[], filter: AggregateFilter): string {
  const out: string[] = ['# 라이브러리 취합', ''];
  const filterParts: string[] = [];
  if (filter.color !== 'all') filterParts.push(`라벨: ${colorLabel(filter.color)}`);
  if (filter.use !== 'all') filterParts.push(`인용 목적: ${citationUseLabel(filter.use) ?? filter.use}`);
  out.push(`- 필터: ${filterParts.length ? filterParts.join(' · ') : '전체'}`);
  out.push(`- 항목 ${items.length}건 · 내보낸 날짜: ${new Date().toLocaleString('ko-KR')}`, '');
  const byPaper = new Map<string, AggregatedItem[]>();
  for (const item of items) {
    const group = byPaper.get(item.paperId) ?? [];
    group.push(item);
    byPaper.set(item.paperId, group);
  }
  for (const group of byPaper.values()) {
    const { paperTitle, paperAuthors } = group[0];
    out.push(`## ${paperTitle}${paperAuthors ? ` — ${paperAuthors}` : ''}`, '');
    for (const item of group) {
      const tags = [colorLabel(item.color)];
      const use = citationUseLabel(item.citationUse);
      if (use) tags.push(`인용: ${use}${item.citationSuggested ? '(제안)' : ''}`);
      out.push(`> ${item.text}`, `> — ${tags.join(' · ')}`, '');
    }
  }
  return out.join('\n');
}
