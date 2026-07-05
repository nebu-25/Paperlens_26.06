import { describe, expect, it } from 'vitest';
import {
  AGGREGATE_ALL,
  aggregateLibrary,
  buildAggregateMarkdown,
  collectBuilderMaterials,
  filterAggregated,
} from './aggregate';
import { normalizeNote } from './notes';
import type { Paper, ReviewNote } from '../types';

const paper = (id: string, title: string): Paper => ({
  id, title, authors: `${title} 저자`, link: '', text: '',
});

const library: Record<string, Paper> = {
  p1: paper('p1', '논문 A'),
  p2: paper('p2', '논문 B'),
  p3: paper('p3', '노트 없는 논문'),
};

const notes: Record<string, ReviewNote> = {
  p1: normalizeNote({
    highlights: [
      { id: 'h1', text: '한계 문장', color: 'pink', citationUse: 'limitation', citationSuggested: true },
      { id: 'h2', text: '주장 문장', color: 'yellow' },
    ],
    manualSummaries: [{ id: 'm1', text: '수동 반론', color: 'pink', citationUse: 'counterargument' }],
    terms: [{ id: 't1', term: 'BERT', explanation: '', addedByUser: true, aiExplained: false }],
  }),
  p2: normalizeNote({
    highlights: [{ id: 'h3', text: '결과 수치', color: 'blue', citationUse: 'comparison' }],
    terms: [{ id: 't2', term: 'bert', explanation: '', addedByUser: true, aiExplained: false }],
  }),
};

describe('aggregateLibrary (FR-25)', () => {
  it('flattens highlights and manual summaries with paper provenance, skipping papers without notes', () => {
    const items = aggregateLibrary(library, notes);
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.paperTitle !== '노트 없는 논문')).toBe(true);
    const manual = items.find((i) => i.source === 'manual');
    expect(manual?.paperTitle).toBe('논문 A');
  });

  it('carries the original note item id for back-links (역링크)', () => {
    const items = aggregateLibrary(library, notes);
    const highlight = items.find((i) => i.text === '한계 문장');
    expect(highlight?.itemId).toBe('h1');
    const manual = items.find((i) => i.source === 'manual');
    expect(manual?.itemId).toBe('m1');
  });

  it('filters by label and citation use', () => {
    const items = aggregateLibrary(library, notes);
    expect(filterAggregated(items, { color: 'pink', use: 'all' })).toHaveLength(2);
    expect(filterAggregated(items, { color: 'all', use: 'comparison' })).toHaveLength(1);
    expect(filterAggregated(items, { color: 'pink', use: 'counterargument' })).toHaveLength(1);
    expect(filterAggregated(items, AGGREGATE_ALL)).toHaveLength(4);
  });
});

describe('collectBuilderMaterials (§8-8 재료)', () => {
  it('collects deduped keywords and label buckets', () => {
    const materials = collectBuilderMaterials(library, notes);
    expect(materials.keywords).toEqual(['BERT']); // 대소문자 무시 중복 제거
    expect(materials.limitations).toHaveLength(2);
    expect(materials.perspectives).toHaveLength(1);
    expect(materials.critiques).toHaveLength(0);
  });
});

describe('buildAggregateMarkdown', () => {
  it('groups by paper with provenance and marks suggested citations', () => {
    const items = aggregateLibrary(library, notes);
    const md = buildAggregateMarkdown(
      filterAggregated(items, { color: 'pink', use: 'all' }),
      { color: 'pink', use: 'all' },
    );
    expect(md).toContain('## 논문 A — 논문 A 저자');
    expect(md).toContain('> 한계 문장');
    expect(md).toContain('인용: 한계 언급(제안)');
    expect(md).toContain('라벨: 한계/비판');
    expect(md).not.toContain('논문 B');
  });
});
