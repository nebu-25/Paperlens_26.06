import { Highlighter, Library } from 'lucide-react';
import { HIGHLIGHT_COLORS } from '../../constants';
import type { HighlightColor } from '../../types';

// 색상 선택(원형 점). 추출 텍스트/PDF 선택 툴바가 공유해 형식을 통일한다.
export function HighlightColorSwatches({
  selected,
  onSelect,
}: {
  selected: HighlightColor;
  onSelect: (color: HighlightColor) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          className={`size-5 rounded-full border ${
            selected === color.value ? 'border-ink ring-2 ring-action/30' : 'border-line'
          } ${color.swatchClass}`}
          title={`하이라이트 색상: ${color.label}`}
          aria-label={`하이라이트 색상 ${color.label}`}
          onClick={() => onSelect(color.value)}
        />
      ))}
    </div>
  );
}

const SELECTION_ACTION_CLASS =
  'inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold text-ink hover:bg-paper';

// "하이라이트" 실행 버튼(두 툴바 공용).
export function HighlightButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={SELECTION_ACTION_CLASS} onClick={onClick}>
      <Highlighter size={14} /> 하이라이트
    </button>
  );
}

// "용어 추가" 버튼(두 툴바 공용).
export function AddTermButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={SELECTION_ACTION_CLASS} onClick={onClick}>
      <Library size={14} /> 용어 추가
    </button>
  );
}
