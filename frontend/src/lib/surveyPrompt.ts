export type SurveyPromptReason = 'export' | 'sign-out';

const SURVEY_COMPLETED_KEY = 'paperlens:demo-survey:completed';
const SURVEY_SESSION_HIDDEN_KEY = 'paperlens:demo-survey:hidden-this-session';
const SURVEY_SESSION_SHOWN_KEY = 'paperlens:demo-survey:shown-this-session';

export function canShowSurveyPrompt(reason: SurveyPromptReason) {
  try {
    if (window.localStorage.getItem(SURVEY_COMPLETED_KEY) === 'true') return false;
    // 사용자가 "이 세션에서 다시 보지 않기"를 택했으면 어떤 설문도 노출하지 않는다.
    if (window.sessionStorage.getItem(SURVEY_SESSION_HIDDEN_KEY) === 'true') return false;
    if (reason === 'sign-out') {
      // 종료 설문은 로그아웃 때마다 노출한다. 사용자가 숨기거나 설문을 완료한 경우만 차단한다.
      return true;
    }
    return window.sessionStorage.getItem(SURVEY_SESSION_SHOWN_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function markSurveyPromptShown(reason: SurveyPromptReason) {
  void reason;
  try {
    window.sessionStorage.setItem(SURVEY_SESSION_SHOWN_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}

export function markSurveyCompleted() {
  try {
    window.localStorage.setItem(SURVEY_COMPLETED_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}

export function markSurveyHiddenForSession() {
  try {
    window.sessionStorage.setItem(SURVEY_SESSION_HIDDEN_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}
