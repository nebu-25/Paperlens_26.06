import { EMPTY_NOTE, searchableText } from './notes';
import type { Paper, ReviewNote } from '../types';

export function collectTags(notes: Record<string, ReviewNote>): string[] {
  return Array.from(new Set(Object.values(notes).flatMap((note) => note.tags ?? []))).sort((a, b) =>
    a.localeCompare(b, 'ko'),
  );
}

export function filterPapers(
  library: Record<string, Paper>,
  notes: Record<string, ReviewNote>,
  search: string,
  activeTags: string[],
): Paper[] {
  const query = search.trim().toLowerCase();
  return Object.values(library).filter((paper) => {
    const note = notes[paper.id] ?? EMPTY_NOTE;
    if (activeTags.length > 0 && !activeTags.every((tag) => (note.tags ?? []).includes(tag))) {
      return false;
    }
    if (query && !searchableText(paper, note).includes(query)) return false;
    return true;
  });
}
