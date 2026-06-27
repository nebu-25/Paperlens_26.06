import { describe, expect, it } from 'vitest';
import { buildChecklist, countDone } from './reviewProgress';
import { EMPTY_NOTE } from './notes';

describe('buildChecklist', () => {
  it('checks current review feature progress', () => {
    const checklist = buildChecklist({
      ...EMPTY_NOTE,
      highlights: [{ id: 'h', text: 'important sentence', color: 'yellow' }],
      terms: [{ id: 't', term: 'FMEA', explanation: 'risk method', addedByUser: true, aiExplained: false }],
    });

    expect(checklist.find((item) => item.label === '하이라이트')?.done).toBe(true);
    expect(checklist.find((item) => item.label === '용어 사전')?.done).toBe(true);
    expect(countDone(checklist)).toBe(2);
  });

  it('checks manual summary template progress', () => {
    const checklist = buildChecklist({
      ...EMPTY_NOTE,
      manualSummaries: [{ id: 'm', text: 'manual result summary', color: 'blue' }],
    });

    expect(checklist.find((item) => item.label === '수동 요약 템플릿')?.done).toBe(true);
  });
});
