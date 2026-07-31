import { describe, expect, it } from 'vitest';
import { nextSaveWaitMs, pickActivePaperId } from './useReviewPersistence';

describe('자동저장 대기 시간(nextSaveWaitMs)', () => {
  it('편집이 막 시작되면 trailing 5초를 기다린다', () => {
    expect(nextSaveWaitMs(0)).toBe(5000);
  });

  it('연속 편집이 길어져도 maxWait(10초)를 넘기지 않는다', () => {
    // 경과 6초: 남은 maxWait 4초가 trailing 5초보다 짧으므로 4초로 단축
    expect(nextSaveWaitMs(6000)).toBe(4000);
  });

  it('maxWait를 이미 넘겼으면 즉시(0초) 저장한다', () => {
    expect(nextSaveWaitMs(10000)).toBe(0);
    expect(nextSaveWaitMs(12000)).toBe(0);
  });
});

describe('복원 후 active 논문 선택', () => {
  it('데모 세션에서는 빠른 리뷰 샘플을 먼저 연다', () => {
    expect(
      pickActivePaperId(
        {
          sample: {
            id: 'sample',
            title: 'Sample PDF',
            authors: '',
            link: '',
            text: '',
            sourceKey: 'demo-session:demo-paperlens-sample-pdf',
          },
          quickstart: {
            id: 'quickstart',
            title: 'Quickstart',
            authors: '',
            link: '',
            text: '',
            sourceKey: 'demo-session:demo-paperlens-quickstart',
          },
        },
        null,
        true,
      ),
    ).toBe('quickstart');
  });

  it('사용자가 마지막으로 열었던 논문 힌트가 있으면 그 값을 우선한다', () => {
    expect(
      pickActivePaperId(
        {
          quickstart: {
            id: 'quickstart',
            title: 'Quickstart',
            authors: '',
            link: '',
            text: '',
            sourceKey: 'demo-session:demo-paperlens-quickstart',
          },
          selected: {
            id: 'selected',
            title: 'Selected',
            authors: '',
            link: '',
            text: '',
            sourceKey: 'demo-session:demo-paperlens-sample-pdf',
          },
        },
        'selected',
        true,
      ),
    ).toBe('selected');
  });
});
