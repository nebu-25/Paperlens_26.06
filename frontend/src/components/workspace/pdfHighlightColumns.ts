// PDF 하이라이트의 다단 컬럼 번짐 방지용 순수 헬퍼.
// PDF.js 텍스트 레이어는 콘텐츠 스트림 순서(2단 논문은 흔히 좌↔우 행 교차)로 span을 만들어,
// 네이티브 선택이 DOM 순서를 따라 오른쪽 컬럼까지 번진다. 선택 rect를 컬럼 밴드로 나눠
// 드래그가 지난 밴드만 남기기 위한 계산이다.

export const COLUMN_BAND_GAP = 8; // px. 컬럼 사이 최소 수평 간격(이보다 벌어지면 다른 컬럼으로 본다)

export type XSpan = { left: number; right: number };

// 선택 rect들의 x구간을 병합해 "컬럼 밴드"로 만든다(겹치거나 8px 이내면 같은 밴드).
export function mergeColumnBands(rects: XSpan[]): XSpan[] {
  const sorted = [...rects].sort((a, b) => a.left - b.left);
  const bands: XSpan[] = [];
  for (const r of sorted) {
    const last = bands[bands.length - 1];
    if (last && r.left <= last.right + COLUMN_BAND_GAP) {
      last.right = Math.max(last.right, r.right);
    } else {
      bands.push({ left: r.left, right: r.right });
    }
  }
  return bands;
}

// span의 중심 x가 속한 밴드 index(못 찾으면 -1).
export function bandIndexOf(bands: XSpan[], span: XSpan): number {
  const center = (span.left + span.right) / 2;
  return bands.findIndex(
    (b) => center >= b.left - COLUMN_BAND_GAP && center <= b.right + COLUMN_BAND_GAP,
  );
}

// 가로 텍스트 줄 여부. 정상 본문 rect는 가로가 세로보다 넓고,
// arXiv 좌측 여백의 회전(세로) 스탬프는 세로가 훨씬 길다 → 하이라이트 대상에서 제외용.
export function isHorizontalRect(r: { width: number; height: number }): boolean {
  return r.width >= r.height;
}
