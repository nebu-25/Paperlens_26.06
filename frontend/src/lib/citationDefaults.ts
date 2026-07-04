// 라벨 → 인용 목적 기본값 (기획서 v4.0 §8-4, FR-23) — 순수 매핑.
// 하이라이트/수동 요약에 의미 라벨을 붙이는 순간 인용 목적 기본값을 제안한다.
// 제안은 citationSuggested=true로 표시되며, 사용자가 select를 만지는 순간 확정으로 바뀐다.
import type { CitationUse, HighlightColor } from '../types';

const LABEL_TO_CITATION: Partial<Record<HighlightColor, CitationUse>> = {
  yellow: 'premise', // 주장 → 전제 인용
  green: 'method', // 방법론 → 방법 참고
  blue: 'comparison', // 결과 → 결과 비교
  pink: 'limitation', // 한계/비판 → 한계 언급
  violet: 'premise', // 근거 → 전제 인용
  // orange(질문/후속 확인)는 제안 없음 — 사용자 판단
};

export function suggestCitationUse(color?: HighlightColor): CitationUse | undefined {
  if (!color) return undefined;
  return LABEL_TO_CITATION[color];
}

// 생성 시점에 제안을 함께 실어 보낼 필드 묶음. 제안이 없으면 빈 객체.
export function citationSuggestionFields(
  color?: HighlightColor,
): { citationUse?: CitationUse; citationSuggested?: boolean } {
  const suggested = suggestCitationUse(color);
  return suggested ? { citationUse: suggested, citationSuggested: true } : {};
}
