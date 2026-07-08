export type SurveyPromptReason = 'export' | 'sign-out';

const SURVEY_COMPLETED_KEY = 'paperlens:demo-survey:completed';
const SURVEY_SESSION_HIDDEN_KEY = 'paperlens:demo-survey:hidden-this-session';
const SURVEY_SESSION_SHOWN_KEY = 'paperlens:demo-survey:shown-this-session';
// 로그아웃(종료) 설문은 세션 내 다른 설문(내보내기)이 이미 표시됐더라도
// 한 번은 노출돼야 하므로 별도 세션 키로 추적한다.
const SURVEY_SESSION_SIGNOUT_SHOWN_KEY = 'paperlens:demo-survey:signout-shown-this-session';

export function canShowSurveyPrompt(reason: SurveyPromptReason) {
  try {
    if (window.localStorage.getItem(SURVEY_COMPLETED_KEY) === 'true') return false;
    // 사용자가 "이 세션에서 다시 보지 않기"를 택했으면 어떤 설문도 노출하지 않는다.
    if (window.sessionStorage.getItem(SURVEY_SESSION_HIDDEN_KEY) === 'true') return false;
    if (reason === 'sign-out') {
      // 종료 설문은 자체 노출 여부만 확인한다. 내보내기 설문이 먼저 표시돼
      // SHOWN 키가 설정됐더라도 로그아웃 시 한 번은 물어본다.
      return window.sessionStorage.getItem(SURVEY_SESSION_SIGNOUT_SHOWN_KEY) !== 'true';
    }
    return window.sessionStorage.getItem(SURVEY_SESSION_SHOWN_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function markSurveyPromptShown(reason: SurveyPromptReason) {
  try {
    window.sessionStorage.setItem(SURVEY_SESSION_SHOWN_KEY, 'true');
    if (reason === 'sign-out') {
      window.sessionStorage.setItem(SURVEY_SESSION_SIGNOUT_SHOWN_KEY, 'true');
    }
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
