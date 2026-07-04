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
    for (const id of ['t1_general', 't2_related', 't3_method', 't4_critical', 't5_results']) {
      expect(isPurposeTemplateId(id)).toBe(true);
    }
    expect(isPurposeTemplateId('t9_future')).toBe(false);
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

  it('T2 requires 1+ citation candidate AND the "한 문장 소개" answer', () => {
    const t2 = resolvePurposeTemplate('t2_related');
    const answerOnly = makeNote({ templateAnswers: { t2_related: { q2: '이 논문은 …를 보였다.' } } });
    expect(t2.isComplete(answerOnly)).toBe(false);

    const withCitation = makeNote({
      highlights: [{ id: 'h', text: 'x', color: 'yellow', citationUse: 'premise' }],
      templateAnswers: { t2_related: { q2: '이 논문은 …를 보였다.' } },
    });
    expect(t2.isComplete(withCitation)).toBe(true);

    // 수동 요약의 인용 후보도 보드 기준과 동일하게 집계된다.
    const withManualCitation = makeNote({
      manualSummaries: [{ id: 'm', text: 'x', color: 'yellow', citationUse: 'related_work' }],
      templateAnswers: { t2_related: { q2: '소개 문장' } },
    });
    expect(t2.isComplete(withManualCitation)).toBe(true);
  });

  it('T3 requires 3+ 방법론 highlights AND the 적용 계획 answer', () => {
    const t3 = resolvePurposeTemplate('t3_method');
    const green = (id: string) => ({ id, text: `g-${id}`, color: 'green' as const });
    const two = makeNote({
      highlights: [green('1'), green('2')],
      templateAnswers: { t3_method: { q3: '표본 기준을 우리 데이터로 교체' } },
    });
    expect(t3.isComplete(two)).toBe(false);
    const three = makeNote({
      highlights: [green('1'), green('2'), green('3')],
      templateAnswers: { t3_method: { q3: '표본 기준을 우리 데이터로 교체' } },
    });
    expect(t3.isComplete(three)).toBe(true);
  });

  it('T5 requires a 결과 비교 citation candidate', () => {
    const t5 = resolvePurposeTemplate('t5_results');
    expect(t5.isComplete(makeNote())).toBe(false);
    expect(
      t5.isComplete(
        makeNote({ highlights: [{ id: 'h', text: 'x', color: 'blue', citationUse: 'comparison' }] }),
      ),
    ).toBe(true);
    expect(
      t5.isComplete(
        makeNote({ manualSummaries: [{ id: 'm', text: 'x', color: 'blue', citationUse: 'comparison' }] }),
      ),
    ).toBe(true);
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
