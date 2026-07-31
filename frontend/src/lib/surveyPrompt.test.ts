// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  canShowSurveyPrompt,
  markSurveyCompleted,
  markSurveyHiddenForSession,
  markSurveyPromptShown,
} from './surveyPrompt';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('survey prompt policy', () => {
  it('로그아웃 설문은 이미 표시된 뒤에도 다시 노출할 수 있다', () => {
    expect(canShowSurveyPrompt('sign-out')).toBe(true);

    markSurveyPromptShown('sign-out');

    expect(canShowSurveyPrompt('sign-out')).toBe(true);
  });

  it('기존 sign-out 세션 키가 남아 있어도 로그아웃 설문을 막지 않는다', () => {
    window.sessionStorage.setItem('paperlens:demo-survey:signout-shown-this-session', 'true');

    expect(canShowSurveyPrompt('sign-out')).toBe(true);
  });

  it('다시 보지 않기 또는 설문 완료 상태에서는 로그아웃 설문을 숨긴다', () => {
    markSurveyHiddenForSession();
    expect(canShowSurveyPrompt('sign-out')).toBe(false);

    window.sessionStorage.clear();
    markSurveyCompleted();
    expect(canShowSurveyPrompt('sign-out')).toBe(false);
  });
});
