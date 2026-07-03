import { describe, expect, it } from 'vitest';
import { bandIndexOf, isHorizontalRect, mergeColumnBands } from './pdfHighlightColumns';

describe('PDF 하이라이트 컬럼 밴드', () => {
  it('좌우 2단 rect를 두 밴드로 분리', () => {
    const bands = mergeColumnBands([
      { left: 50, right: 300 },
      { left: 50, right: 160 }, // 왼쪽 컬럼
      { left: 320, right: 560 },
      { left: 320, right: 480 }, // 오른쪽 컬럼
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0].right).toBeLessThan(bands[1].left);
  });

  it('같은 컬럼 내 여러 줄은 한 밴드', () => {
    const bands = mergeColumnBands([
      { left: 50, right: 300 },
      { left: 180, right: 300 },
      { left: 50, right: 120 },
    ]);
    expect(bands).toHaveLength(1);
  });

  it('끝점 x로 밴드를 판정', () => {
    const bands = mergeColumnBands([
      { left: 50, right: 300 },
      { left: 320, right: 560 },
    ]);
    expect(bandIndexOf(bands, { left: 120, right: 120 })).toBe(0); // 왼쪽
    expect(bandIndexOf(bands, { left: 400, right: 400 })).toBe(1); // 오른쪽
  });
});

describe('회전(세로) 스탬프 제외', () => {
  it('가로 본문 줄 rect는 유지', () => {
    expect(isHorizontalRect({ width: 240, height: 14 })).toBe(true);
  });

  it('세로 arXiv 스탬프 rect는 제외', () => {
    // arXiv 좌측 여백 스탬프: 27px 폭 × 336px 높이
    expect(isHorizontalRect({ width: 27, height: 336 })).toBe(false);
  });
});
