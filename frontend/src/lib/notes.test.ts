import { describe, expect, it } from 'vitest';
import {
  detectedSectionNames,
  mergeTags,
  normalizeNote,
  searchableText,
  sectionSummariesFromDetected,
} from './notes';
import type { DetectedSection, Paper, ReviewNote } from '../types';

const section = (canonical: string): DetectedSection => ({ title: canonical, canonical });

describe('detectedSectionNames', () => {
  it('keeps canonical names in order, deduped', () => {
    const input = [section('Introduction'), section('Method'), section('Introduction')];
    expect(detectedSectionNames(input)).toEqual(['Introduction', 'Method']);
  });

  it('excludes non-summary sections (References/Acknowledgments/Appendix)', () => {
    const input = [section('Introduction'), section('Method'), section('References')];
    expect(detectedSectionNames(input)).toEqual(['Introduction', 'Method']);
  });

  it('ignores detections without a canonical name', () => {
    const input: DetectedSection[] = [
      { title: 'Multi-Head Attention', canonical: '' },
      section('Introduction'),
      section('Conclusion'),
    ];
    expect(detectedSectionNames(input)).toEqual(['Introduction', 'Conclusion']);
  });

  it('returns empty when fewer than two usable sections', () => {
    expect(detectedSectionNames([section('Introduction')])).toEqual([]);
    expect(detectedSectionNames([])).toEqual([]);
    expect(detectedSectionNames(undefined)).toEqual([]);
  });
});

describe('sectionSummariesFromDetected', () => {
  it('builds editable cards from detected sections', () => {
    const cards = sectionSummariesFromDetected([section('Introduction'), section('Result')]);
    expect(cards.map((c) => c.section)).toEqual(['Introduction', 'Result']);
    expect(cards.every((c) => c.content === '' && c.source === 'user')).toBe(true);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length); // 고유 id
  });

  it('falls back to default sections when detection is insufficient', () => {
    const cards = sectionSummariesFromDetected([section('Introduction')]);
    expect(cards.map((c) => c.section)).toEqual(['Introduction', 'Method', 'Result', 'Conclusion']);
  });
});

describe('mergeTags', () => {
  it('appends new tags, dedupes case-insensitively, drops blanks', () => {
    expect(mergeTags(['NLP'], ['nlp', 'Vision', '  '])).toEqual(['NLP', 'Vision']);
  });

  it('handles missing suggested list', () => {
    expect(mergeTags(['a'])).toEqual(['a']);
  });
});

describe('normalizeNote', () => {
  it('fills missing sectionSummaries with defaults', () => {
    const note = normalizeNote({ oneLineSummary: 'hi' });
    expect(note.oneLineSummary).toBe('hi');
    expect(note.sectionSummaries.map((s) => s.section)).toEqual([
      'Introduction',
      'Method',
      'Result',
      'Conclusion',
    ]);
    expect(note.tags).toEqual([]);
  });

  it('preserves existing sectionSummaries', () => {
    const note = normalizeNote({
      sectionSummaries: [{ id: 'x', section: 'Custom', content: 'c', source: 'user' }],
    });
    expect(note.sectionSummaries).toHaveLength(1);
    expect(note.sectionSummaries[0].section).toBe('Custom');
  });
});

describe('searchableText', () => {
  it('lowercases and includes metadata, tags, and note content', () => {
    const paper: Paper = {
      id: '1',
      title: 'Attention',
      authors: 'Vaswani',
      link: 'https://x',
      doi: '10.1/x',
      suggestedTags: ['NLP'],
      text: 'body',
    };
    const note: ReviewNote = {
      oneLineSummary: 'My Summary',
      oneLineSource: 'user',
      summaryMode: 'section',
      tags: ['Transformer'],
      sectionSummaries: [{ id: 's', section: 'Intro', content: 'detail', source: 'user' }],
      highlights: [{ id: 'h', text: 'Quoted' }],
      manualSummaries: [{ id: 'm', text: 'Manual note', color: 'yellow' }],
      terms: [{ id: 't', term: 'BLEU', explanation: 'metric', addedByUser: true, aiExplained: false }],
      questions: [{ id: 'q', text: 'Why?' }],
      template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
      memos: { Abstract: 'memo' },
    };
    const haystack = searchableText(paper, note);
    expect(haystack).toBe(haystack.toLowerCase());
    for (const needle of [
      'attention',
      'vaswani',
      'nlp',
      'transformer',
      'detail',
      'manual note',
      'quoted',
      'bleu',
      'why?',
      'memo',
    ]) {
      expect(haystack).toContain(needle);
    }
  });
});
