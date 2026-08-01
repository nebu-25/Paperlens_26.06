import { useWorkspace } from './WorkspaceContext';
import {
  AddTermButton,
  HighlightButton,
  HighlightColorSwatches,
  RemoveHighlightButton,
} from './HighlightSelectionControls';

export function SelectionToolbar() {
  const {
    selection,
    selectionHighlightIds,
    highlightColor,
    setHighlightColor,
    addHighlight,
    removeSelectionHighlights,
    addTerm,
  } = useWorkspace().store;
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
      {selectionHighlightIds.length > 0 && (
        <RemoveHighlightButton count={selectionHighlightIds.length} onClick={removeSelectionHighlights} />
      )}
      <AddTermButton onClick={addTerm} />
    </div>
  );
}
