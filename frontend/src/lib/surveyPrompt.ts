export type SurveyPromptReason = 'export' | 'sign-out';

const SURVEY_COMPLETED_KEY = 'paperlens:demo-survey:completed';
const SURVEY_SESSION_HIDDEN_KEY = 'paperlens:demo-survey:hidden-this-session';
const SURVEY_SESSION_SHOWN_KEY = 'paperlens:demo-survey:shown-this-session';

export function canShowSurveyPrompt() {
  try {
    return (
      window.localStorage.getItem(SURVEY_COMPLETED_KEY) !== 'true'
      && window.sessionStorage.getItem(SURVEY_SESSION_HIDDEN_KEY) !== 'true'
      && window.sessionStorage.getItem(SURVEY_SESSION_SHOWN_KEY) !== 'true'
    );
  } catch {
    return true;
  }
}

export function markSurveyPromptShown() {
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
