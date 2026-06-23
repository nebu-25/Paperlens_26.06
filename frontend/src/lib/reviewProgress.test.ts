import { describe, expect, it } from 'vitest';
import { buildChecklist, countDone } from './reviewProgress';
import { EMPTY_NOTE } from './notes';

describe('buildChecklist', () => {
  it('checks section summary progress in section mode', () => {
    const checklist = buildChecklist({
      ...EMPTY_NOTE,
      oneLineSummary: 'core idea',
      sectionSummaries: [{ id: 's', section: 'Intro', content: 'detail', source: 'user' }],
    });

    expect(checklist.find((item) => item.label === '한 줄 요약')?.done).toBe(true);
    expect(checklist.find((item) => item.label === '섹션별 요약')?.done).toBe(true);
    expect(countDone(checklist)).toBe(2);
  });

  it('checks template progress in template mode', () => {
    const checklist = buildChecklist({
      ...EMPTY_NOTE,
      summaryMode: 'template',
      template: { ...EMPTY_NOTE.template, q4: 'limited sample size' },
    });

    expect(checklist.find((item) => item.label === '5문항 템플릿')?.done).toBe(true);
  });
});
