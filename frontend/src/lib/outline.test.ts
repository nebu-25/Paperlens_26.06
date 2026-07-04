import { describe, expect, it } from 'vitest';
import { buildOutline } from './outline';
import type { DetectedSection } from '../types';

const s = (title: string, start?: number, canonical = ''): DetectedSection => ({
  title,
  canonical,
  start,
});

describe('buildOutline (FR-26)', () => {
  it('keeps sections with valid offsets, sorted by position', () => {
    const outline = buildOutline(
      [s('결론', 800, 'Conclusion'), s('서론', 100, 'Introduction'), s('초록', 10, 'Abstract')],
      1000,
    );
    expect(outline.map((e) => e.title)).toEqual(['초록', '서론', '결론']);
  });

  it('marks Abstract/Conclusion as skim targets (pass 1)', () => {
    const outline = buildOutline(
      [s('초록', 10, 'Abstract'), s('방법', 300, 'Method'), s('결론', 800, 'Conclusion')],
      1000,
    );
    expect(outline.map((e) => e.skimTarget)).toEqual([true, false, true]);
  });

  it('drops entries without offsets, out-of-range offsets, empty titles, duplicates', () => {
    const outline = buildOutline(
      [s('제목만'), s('범위 밖', 5000), s('', 50), s('서론', 100), s('중복', 100), s('결과', 400)],
      1000,
    );
    expect(outline.map((e) => e.title)).toEqual(['서론', '결과']);
  });

  it('returns empty when fewer than two usable sections (감지 부족 시 비표시)', () => {
    expect(buildOutline([s('서론', 100)], 1000)).toEqual([]);
    expect(buildOutline(undefined, 1000)).toEqual([]);
    expect(buildOutline([s('서론', 100), s('결론', 800)], 0)).toEqual([]);
  });
});
