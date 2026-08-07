import type { PdfAreaNote } from '../../types';

type PdfRect = PdfAreaNote['rect'];

export type PdfAreaNoteMarker = {
  notes: PdfAreaNote[];
  x: number;
  y: number;
};

function overlaps(a: PdfRect, b: PdfRect) {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

// 겹친 메모는 하나의 마커로 묶되, A-B-B-C처럼 이어진 영역도 같은 묶음으로 보인다.
export function groupPdfAreaNoteMarkers(notes: PdfAreaNote[]): PdfAreaNoteMarker[] {
  const remaining = new Set(notes.map((note) => note.id));
  const groups: PdfAreaNoteMarker[] = [];

  for (const note of notes) {
    if (!remaining.delete(note.id)) continue;
    const group = [note];
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index];
      for (const candidate of notes) {
        if (!remaining.has(candidate.id) || !overlaps(current.rect, candidate.rect)) continue;
        remaining.delete(candidate.id);
        group.push(candidate);
      }
    }
    const right = Math.max(...group.map((item) => item.rect.x + item.rect.width));
    const bottom = Math.max(...group.map((item) => item.rect.y + item.rect.height));
    groups.push({ notes: group, x: right, y: bottom });
  }

  return groups;
}
