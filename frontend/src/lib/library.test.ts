import { describe, expect, it } from 'vitest';
import { collectTags, filterPapers } from './library';
import { EMPTY_NOTE } from './notes';
import type { Paper, ReviewNote } from '../types';

const paper = (id: string, title: string): Paper => ({
  id,
  title,
  authors: '',
  link: '',
  text: '',
});

describe('collectTags', () => {
  it('dedupes and sorts tags for the sidebar filter', () => {
    const notes: Record<string, ReviewNote> = {
      a: { ...EMPTY_NOTE, tags: ['NLP', 'Vision'] },
      b: { ...EMPTY_NOTE, tags: ['Vision', 'Graph'] },
    };

    expect(collectTags(notes)).toEqual(['Graph', 'NLP', 'Vision']);
  });
});

describe('filterPapers', () => {
  it('matches search text across paper metadata and note content', () => {
    const library = {
      a: paper('a', 'Attention'),
      b: paper('b', 'Diffusion'),
    };
    const notes = {
      a: { ...EMPTY_NOTE, oneLineSummary: 'transformer summary' },
      b: { ...EMPTY_NOTE, oneLineSummary: 'image model' },
    };

    expect(filterPapers(library, notes, 'transformer', []).map((p) => p.id)).toEqual(['a']);
  });

  it('requires all active tags', () => {
    const library = {
      a: paper('a', 'A'),
      b: paper('b', 'B'),
    };
    const notes = {
      a: { ...EMPTY_NOTE, tags: ['NLP', 'Transformer'] },
      b: { ...EMPTY_NOTE, tags: ['NLP'] },
    };

    expect(filterPapers(library, notes, '', ['NLP', 'Transformer']).map((p) => p.id)).toEqual(['a']);
  });
});
