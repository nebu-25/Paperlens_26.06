// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalReviewCache, readLocalReviewCache, writeLocalReviewCache } from './localReviewCache';
import type { Paper, ReviewNote } from '../types';

const paper: Paper = {
  id: 'p1',
  title: 'Cached Paper',
  authors: 'Author',
  link: '',
  text: 'large extracted paper text',
};

const note: ReviewNote = {
  oneLineSummary: '',
  oneLineSource: 'user',
  summaryMode: 'section',
  tags: [],
  sectionSummaries: [],
  highlights: [],
  manualSummaries: [],
  terms: [],
  questions: [],
  template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
  memos: {},
};

describe('localReviewCache', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('stores paper text separately and restores it with the snapshot', async () => {
    await writeLocalReviewCache('user:u1', {
      library: { p1: paper },
      notes: { p1: note },
      activeId: 'p1',
      dirtyIds: ['p1'],
      textDirtyIds: ['p1'],
      deletedIds: [],
    });

    const values = Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index) ?? '';
      return [key, window.localStorage.getItem(key) ?? ''] as const;
    });
    const snapshotEntry = values.find(([key]) => key === 'paperlens:cache:v2:user:u1');
    const textEntry = values.find(([key]) => key === 'paperlens:cache:v2:user:u1:texts');

    expect(snapshotEntry?.[1]).not.toContain('large extracted paper text');
    expect(textEntry?.[1]).toContain('large extracted paper text');
    await expect(readLocalReviewCache('user:u1')).resolves.toMatchObject({
      library: { p1: { text: 'large extracted paper text' } },
      activeId: 'p1',
    });
  });

  it('clears account-specific cache entries', async () => {
    await writeLocalReviewCache('user:u1', { library: { p1: paper }, notes: { p1: note } });
    await clearLocalReviewCache('user:u1');

    await expect(readLocalReviewCache('user:u1')).resolves.toBeNull();
  });
});
