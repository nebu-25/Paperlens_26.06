import { describe, expect, it } from 'vitest';
import { normalizeNote } from './notes';
import { buildReadingRoadmap } from './readingRoadmap';
import { resolvePurposeTemplate } from './templates';
import type { ReviewNote } from '../types';

const makeNote = (raw: Partial<ReviewNote> = {}): ReviewNote => normalizeNote(raw);
const t1 = resolvePurposeTemplate('t1_general');
const t4 = resolvePurposeTemplate('t4_critical');

const passById = (note: ReviewNote, template = t1) => {
  const passes = buildReadingRoadmap(note, template);
  return Object.fromEntries(passes.map((p) => [p.id, p]));
};

describe('buildReadingRoadmap', () => {
  it('returns skim/target/deep in order, all incomplete for an empty note', () => {
    const passes = buildReadingRoadmap(makeNote(), t1);
    expect(passes.map((p) => p.id)).toEqual(['skim', 'target', 'deep']);
    expect(passes.every((p) => !p.done)).toBe(true);
  });

  it('marks skim done via 주장 highlight, first answer, or one-line summary', () => {
    expect(passById(makeNote({ highlights: [{ id: 'h', text: 'x', color: 'yellow' }] })).skim.done).toBe(true);
    expect(passById(makeNote({ template: { q1: '문제', q2: '', q3: '', q4: '', q5: '' } })).skim.done).toBe(true);
    expect(passById(makeNote({ oneLineSummary: '한 줄' })).skim.done).toBe(true);
    // T4에서는 T4의 첫 질문(관점) 답변이 신호가 된다.
    expect(
      passById(makeNote({ templateAnswers: { t4_critical: { q1: '관점' } } }), t4).skim.done,
    ).toBe(true);
  });

  it('marks target done via 결과 highlight or 결과 비교 인용 후보', () => {
    expect(passById(makeNote({ highlights: [{ id: 'h', text: 'x', color: 'blue' }] })).target.done).toBe(true);
    expect(
      passById(makeNote({ highlights: [{ id: 'h', text: 'x', color: 'green', citationUse: 'comparison' }] }))
        .target.done,
    ).toBe(true);
    expect(
      passById(makeNote({ manualSummaries: [{ id: 'm', text: 'x', color: 'blue', citationUse: 'comparison' }] }))
        .target.done,
    ).toBe(true);
  });

  it('delegates deep completion to the active purpose template', () => {
    const t4Note = makeNote({
      highlights: [
        { id: '1', text: 'a', color: 'pink' },
        { id: '2', text: 'b', color: 'pink' },
      ],
      templateAnswers: { t4_critical: { q3: '숨은 한계' } },
    });
    expect(passById(t4Note, t4).deep.done).toBe(true);
    // 같은 노트라도 T1 기준(5문항)으로는 미완료.
    expect(passById(t4Note, t1).deep.done).toBe(false);
    expect(passById(t4Note, t1).deep.helper).toBe(t1.completionLabel);
  });
});
