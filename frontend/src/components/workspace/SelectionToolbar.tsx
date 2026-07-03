import { useWorkspace } from './WorkspaceContext';
import { AddTermButton, HighlightButton, HighlightColorSwatches } from './HighlightSelectionControls';

export function SelectionToolbar() {
  const { selection, highlightColor, setHighlightColor, addHighlight, addTerm } = useWorkspace().store;
  if (!selection) return null;
  return (
    <div
      className="fixed z-50 flex flex-wrap items-center gap-1 rounded border border-line bg-white p-1 shadow-lg"
      style={{ left: selection.x, top: selection.y + 12 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="border-r border-line pr-1">
        <HighlightColorSwatches selected={highlightColor} onSelect={setHighlightColor} />
      </div>
      <HighlightButton onClick={addHighlight} />
      <AddTermButton onClick={addTerm} />
    </div>
  );
}
