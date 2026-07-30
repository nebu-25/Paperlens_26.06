// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { markGuideSeen, resetGuide, shouldShowGuide } from './onboardingGuide';

afterEach(() => {
  window.localStorage.clear();
});

describe('onboardingGuide seen tracking', () => {
  it('shows the guide for a fresh user and hides it once marked seen', () => {
    expect(shouldShowGuide('user-1')).toBe(true);
    markGuideSeen('user-1');
    expect(shouldShowGuide('user-1')).toBe(false);
  });

  it('scopes the seen flag per user id', () => {
    markGuideSeen('user-1');
    expect(shouldShowGuide('user-1')).toBe(false);
    // 다른 계정은 여전히 처음이다.
    expect(shouldShowGuide('user-2')).toBe(true);
  });

  it('falls back to an anonymous key for logged-out users', () => {
    expect(shouldShowGuide(null)).toBe(true);
    markGuideSeen(null);
    expect(shouldShowGuide(null)).toBe(false);
    // 로그인 사용자는 익명 키에 영향받지 않는다.
    expect(shouldShowGuide('user-1')).toBe(true);
  });

  it('resetGuide re-enables the guide (다시 보기 지원)', () => {
    markGuideSeen('user-1');
    resetGuide('user-1');
    expect(shouldShowGuide('user-1')).toBe(true);
  });
});
