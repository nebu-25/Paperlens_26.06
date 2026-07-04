// 섹션 아웃라인 (기획서 v4.0 §8-7, FR-26) — pass 1(훑기) 네비게이션용 순수 함수.
// 백엔드가 감지한 섹션(paper.sections) 중 원문 오프셋(start)이 유효한 항목만 추린다.
// 감지 실패/부족 시 빈 배열 — "감지된 범위만 표시하고 오탐을 강요하지 않는다".
import type { DetectedSection } from '../types';

export interface OutlineEntry {
  title: string;
  canonical: string;
  start: number;
  // pass 1(제목·초록·결론 훑기)에서 먼저 볼 섹션 표시
  skimTarget: boolean;
}

// 훑기 단계에서 먼저 읽는 정규화 섹션명
const SKIM_SECTIONS = new Set(['Abstract', 'Conclusion']);

export function buildOutline(sections: DetectedSection[] | undefined, textLength: number): OutlineEntry[] {
  if (!sections?.length || textLength <= 0) return [];
  const entries: OutlineEntry[] = [];
  const seenStarts = new Set<number>();
  for (const section of sections) {
    const title = (section.title ?? '').trim();
    if (!title) continue;
    const start = section.start;
    if (typeof start !== 'number' || start < 0 || start >= textLength) continue;
    if (seenStarts.has(start)) continue;
    seenStarts.add(start);
    const canonical = section.canonical ?? '';
    entries.push({ title, canonical, start, skimTarget: SKIM_SECTIONS.has(canonical) });
  }
  entries.sort((a, b) => a.start - b.start);
  // 항목이 1개뿐이면 네비게이션 가치가 없다 (notes.ts detectedSectionNames와 동일 기준).
  return entries.length >= 2 ? entries : [];
}
