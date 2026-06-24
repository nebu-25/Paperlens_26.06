import React, { useMemo } from 'react';
import { highlightStyle, renderHints } from '../lib/format';
import type { HighlightColor, Paper, ReviewNote } from '../types';

export function usePaperBodyNodes(
  paper: Paper | null,
  note: ReviewNote,
  activeHighlightColor: HighlightColor | 'all' = 'all',
): React.ReactNode {
  return useMemo(() => {
    const text = paper?.text ?? '';
    if (!text) return null;
    const ranges = (
      (note.highlights ?? [])
        .filter((h) => activeHighlightColor === 'all' || (h.color ?? 'yellow') === activeHighlightColor)
        .map((h): { start: number; end: number; color?: HighlightColor } | null => {
          if (
            typeof h.start === 'number' &&
            typeof h.end === 'number' &&
            h.start >= 0 &&
            h.end <= text.length &&
            h.end > h.start
          ) {
            return { start: h.start, end: h.end, color: h.color };
          }
          if (h.text) {
            const idx = text.indexOf(h.text);
            if (idx >= 0) return { start: idx, end: idx + h.text.length, color: h.color };
          }
          return null;
        })
        .filter((range): range is { start: number; end: number; color?: HighlightColor } => range !== null)
        .sort((a, b) => a.start - b.start)
    );

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of ranges) {
      const start = Math.max(range.start, cursor);
      const end = range.end;
      if (end <= cursor) continue;
      if (start > cursor) nodes.push(...renderHints(text.slice(cursor, start), cursor));
      const color = highlightStyle(range.color);
      nodes.push(
        <mark key={`hl-${start}-${end}`} className={`rounded ${color.markClass} text-ink`}>
          {text.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < text.length) nodes.push(...renderHints(text.slice(cursor), cursor));
    return nodes;
  }, [activeHighlightColor, paper?.text, note.highlights]);
}
