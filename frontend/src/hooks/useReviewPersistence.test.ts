import { describe, expect, it } from 'vitest';
import { nextSaveWaitMs } from './useReviewPersistence';

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
