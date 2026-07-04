import { describe, expect, it } from 'vitest';
import { normalizeNote } from './notes';
import {
  DEFAULT_TEMPLATE_ID,
  getPurposeAnswers,
  isPurposeTemplateId,
  resolvePurposeTemplate,
} from './templates';
import type { Highlight, ReviewNote } from '../types';

const pinkHighlight = (id: string): Highlight => ({ id, text: `h-${id}`, color: 'pink' });

const makeNote = (raw: Partial<ReviewNote> = {}): ReviewNote => normalizeNote(raw);

describe('resolvePurposeTemplate', () => {
  it('resolves known ids', () => {
    expect(resolvePurposeTemplate('t4_critical').id).toBe('t4_critical');
  });

  it('falls back to T1 for unknown/missing ids (FS-06 예외 규칙)', () => {
    expect(resolvePurposeTemplate(undefined).id).toBe(DEFAULT_TEMPLATE_ID);
    expect(resolvePurposeTemplate('t9_future').id).toBe(DEFAULT_TEMPLATE_ID);
  });
});

describe('isPurposeTemplateId', () => {
  it('accepts only shipped template ids', () => {
    expect(isPurposeTemplateId('t1_general')).toBe(true);
    expect(isPurposeTemplateId('t4_critical')).toBe(true);
    expect(isPurposeTemplateId('t2_related')).toBe(false);
    expect(isPurposeTemplateId(undefined)).toBe(false);
  });
});

describe('getPurposeAnswers', () => {
  it('reads T1 answers from the legacy template field', () => {
    const note = makeNote({ template: { q1: '문제', q2: '', q3: '', q4: '', q5: '' } });
    expect(getPurposeAnswers(note, 't1_general').q1).toBe('문제');
  });

  it('reads other templates from templateAnswers', () => {
    const note = makeNote({ templateAnswers: { t4_critical: { q3: '숨은 한계' } } });
    expect(getPurposeAnswers(note, 't4_critical').q3).toBe('숨은 한계');
    expect(getPurposeAnswers(note, 't4_critical').q1).toBeUndefined();
  });
});

describe('completion (pass 3 완료 기준)', () => {
  it('T1 requires all five answers', () => {
    const t1 = resolvePurposeTemplate('t1_general');
    const partial = makeNote({ template: { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: ' ' } });
    expect(t1.isComplete(partial)).toBe(false);
    const full = makeNote({ template: { q1: 'a', q2: 'b', q3: 'c', q4: 'd', q5: 'e' } });
    expect(t1.isComplete(full)).toBe(true);
  });

  it('T4 requires 2+ 한계/비판 highlights AND the "말하지 않은 한계" answer', () => {
    const t4 = resolvePurposeTemplate('t4_critical');
    const answersOnly = makeNote({ templateAnswers: { t4_critical: { q3: '표본이 작다' } } });
    expect(t4.isComplete(answersOnly)).toBe(false);

    const highlightsOnly = makeNote({ highlights: [pinkHighlight('1'), pinkHighlight('2')] });
    expect(t4.isComplete(highlightsOnly)).toBe(false);

    const both = makeNote({
      highlights: [pinkHighlight('1'), pinkHighlight('2')],
      templateAnswers: { t4_critical: { q3: '표본이 작다' } },
    });
    expect(t4.isComplete(both)).toBe(true);
  });
});
