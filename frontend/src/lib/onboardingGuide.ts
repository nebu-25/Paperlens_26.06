// 첫 사용 안내(온보딩 가이드)의 노출 여부를 사용자 계정 기준으로 영구 1회 추적한다.
// 설문 모달(surveyPrompt.ts)과는 키를 완전히 분리해 서로의 상태를 오염시키지 않는다.
const SEEN_KEY_PREFIX = 'paperlens:onboarding-guide:seen:';

function seenKey(userId: string | null): string {
  // 비로그인(익명) 사용자는 공용 폴백 키를 쓴다.
  return `${SEEN_KEY_PREFIX}${userId || 'anon'}`;
}

export function shouldShowGuide(userId: string | null): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) !== 'true';
  } catch {
    // 저장소를 못 쓰면 매 로드마다 반복 노출되지 않도록 보이지 않게 둔다.
    return false;
  }
}

export function markGuideSeen(userId: string | null): void {
  try {
    window.localStorage.setItem(seenKey(userId), 'true');
  } catch {
    /* storage unavailable */
  }
}

export function resetGuide(userId: string | null): void {
  try {
    window.localStorage.removeItem(seenKey(userId));
  } catch {
    /* storage unavailable */
  }
}
