import { Highlighter, Library } from 'lucide-react';
import { HIGHLIGHT_COLORS } from '../../constants';
import { useWorkspace } from './WorkspaceContext';

export function SelectionToolbar() {
  const { selection, highlightColor, setHighlightColor, addHighlight, addTerm } = useWorkspace().store;
  if (!selection) return null;
  return (
    <div
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded border border-line bg-white p-1 shadow-lg"
      style={{ left: selection.x, top: selection.y + 12 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 border-r border-line pr-1">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            className={`size-5 rounded-full border ${
              highlightColor === color.value ? 'border-ink ring-2 ring-action/30' : 'border-line'
            } ${color.swatchClass}`}
            title={`하이라이트 색상: ${color.label}`}
            aria-label={`하이라이트 색상 ${color.label}`}
            onClick={() => setHighlightColor(color.value)}
          />
        ))}
      </div>
      <button
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-paper"
        onClick={addHighlight}
      >
        <Highlighter size={14} /> 하이라이트
      </button>
      <button
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-paper"
        onClick={addTerm}
      >
        <Library size={14} /> 용어 추가
      </button>
    </div>
  );
}
