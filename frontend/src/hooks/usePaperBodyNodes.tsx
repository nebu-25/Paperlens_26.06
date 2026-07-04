import React, { useMemo, useRef } from 'react';
import type { FigureMentionLink } from '../lib/figureIndex';
import { highlightStyle, renderHints } from '../lib/format';
import type { SignalMatch } from '../lib/signalScanner';
import type { HighlightColor, Paper, ReviewNote } from '../types';

// 하이라이트가 없는 구간에 얹는 인라인 마커: 시그널 문장(승격) 또는 그림/표 교차참조(점프)
type InlineMarker =
  | { kind: 'signal'; start: number; end: number; signal: SignalMatch }
  | { kind: 'mention'; start: number; end: number; mention: FigureMentionLink };

export function usePaperBodyNodes(
  paper: Paper | null,
  note: ReviewNote,
  activeHighlightColor: HighlightColor | 'all' = 'all',
  // 시그널 스캐너(FR-24) 후보 문장. 하이라이트와 겹치는 부분은 하이라이트가 우선한다.
  signals: SignalMatch[] = [],
  onPromoteSignal?: (signal: SignalMatch) => void,
  // 그림/표 교차참조(FR-27). 클릭하면 캡션 위치로 점프한다.
  figureMentions: FigureMentionLink[] = [],
  onJumpToCaption?: (mention: FigureMentionLink) => void,
): React.ReactNode {
  // 콜백은 ref로 유지해 매 렌더마다 본문 노드를 재계산하지 않는다.
  const promoteRef = useRef(onPromoteSignal);
  promoteRef.current = onPromoteSignal;
  const jumpRef = useRef(onJumpToCaption);
  jumpRef.current = onJumpToCaption;

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

    // 시그널·교차참조 마커를 위치순으로 병합. 겹치면 먼저 시작한 쪽이 우선한다.
    const markers: InlineMarker[] = [
      ...signals.map((signal): InlineMarker => ({ kind: 'signal', start: signal.start, end: signal.end, signal })),
      ...figureMentions.map(
        (mention): InlineMarker => ({ kind: 'mention', start: mention.start, end: mention.end, mention }),
      ),
    ].sort((a, b) => a.start - b.start);

    // 하이라이트가 없는 구간을 렌더: 시그널은 점선 밑줄+승격, 교차참조는 링크+점프, 나머지는 용어 힌트.
    const renderPlainSegment = (segStart: number, segEnd: number): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      let cursor = segStart;
      for (const marker of markers) {
        const s = Math.max(marker.start, cursor);
        const e = Math.min(marker.end, segEnd);
        if (e <= s) continue;
        if (s > cursor) parts.push(...renderHints(text.slice(cursor, s), cursor));
        if (marker.kind === 'signal') {
          const { signal } = marker;
          parts.push(
            <span
              key={`sig-${s}-${e}`}
              role="button"
              tabIndex={0}
              className="cursor-pointer border-b-2 border-dashed border-rose-400/80 hover:bg-rose-50"
              title={`${signal.reason} — 클릭하면 '한계/비판' 하이라이트로 추가됩니다`}
              onClick={(event) => {
                event.stopPropagation();
                promoteRef.current?.(signal);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  promoteRef.current?.(signal);
                }
              }}
            >
              {text.slice(s, e)}
            </span>,
          );
        } else {
          const { mention } = marker;
          parts.push(
            <span
              key={`fig-${s}-${e}`}
              role="button"
              tabIndex={0}
              className="cursor-pointer border-b border-action/70 font-medium text-action hover:bg-action/10"
              title={`${mention.targetLabel} 캡션으로 이동`}
              onClick={(event) => {
                event.stopPropagation();
                jumpRef.current?.(mention);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  jumpRef.current?.(mention);
                }
              }}
            >
              {text.slice(s, e)}
            </span>,
          );
        }
        cursor = e;
      }
      if (cursor < segEnd) parts.push(...renderHints(text.slice(cursor, segEnd), cursor));
      return parts;
    };

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of ranges) {
      const start = Math.max(range.start, cursor);
      const end = range.end;
      if (end <= cursor) continue;
      if (start > cursor) nodes.push(...renderPlainSegment(cursor, start));
      const color = highlightStyle(range.color);
      nodes.push(
        <mark key={`hl-${start}-${end}`} className={`rounded ${color.markClass} text-ink`}>
          {text.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < text.length) nodes.push(...renderPlainSegment(cursor, text.length));
    return nodes;
  }, [activeHighlightColor, paper?.text, note.highlights, signals, figureMentions]);
}
