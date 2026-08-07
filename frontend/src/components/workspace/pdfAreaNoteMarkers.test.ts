import { describe, expect, it } from 'vitest';
import type { PdfAreaNote } from '../../types';
import { groupPdfAreaNoteMarkers } from './pdfAreaNoteMarkers';

const note = (id: string, x: number, y: number, width = 40, height = 30): PdfAreaNote => ({
  id,
  page: 1,
  rect: { x, y, width, height },
  kind: 'general',
  memo: id,
  color: 'blue',
});

describe('groupPdfAreaNoteMarkers', () => {
  it('keeps separate notes as individual markers', () => {
    const markers = groupPdfAreaNoteMarkers([note('a', 10, 10), note('b', 100, 100)]);

    expect(markers.map((marker) => marker.notes.map((item) => item.id))).toEqual([['a'], ['b']]);
  });

  it('groups overlapping and transitively connected area notes', () => {
    const markers = groupPdfAreaNoteMarkers([
      note('a', 10, 10),
      note('b', 40, 10),
      note('c', 70, 10),
    ]);

    expect(markers).toHaveLength(1);
    expect(markers[0].notes.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(markers[0]).toMatchObject({ x: 110, y: 40 });
  });
});
