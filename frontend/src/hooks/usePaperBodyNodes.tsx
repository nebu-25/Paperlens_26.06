import React, { useMemo, useRef } from 'react';
import { HIGHLIGHT_COLORS } from '../constants';
import type { FigureMentionLink } from '../lib/figureIndex';
import { highlightStyle, renderHints } from '../lib/format';
import type { SignalMatch, SignalType } from '../lib/signalScanner';
import type { HighlightColor, Paper, ReviewNote } from '../types';

// 시그널 타입별 점선 밑줄 색·승격 라벨. Tailwind JIT가 잡도록 클래스 문자열은 리터럴로 둔다.
const SIGNAL_STYLE: Record<SignalType, { className: string; promoteLabel: string }> = {
  limitation: { className: 'border-rose-400/80 hover:bg-rose-50', promoteLabel: '한계/비판' },
  critique: { className: 'border-amber-400/80 hover:bg-amber-50', promoteLabel: '한계/비판' },
  perspective: { className: 'border-indigo-400/80 hover:bg-indigo-50', promoteLabel: '주장' },
};

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
  // 취합 역링크(FR-25 후속)로 이동해 온 하이라이트 id — 잠시 강조 표시한다.
  focusedHighlightId: string | null = null,
): React.ReactNode {
  // 콜백은 ref로 유지해 매 렌더마다 본문 노드를 재계산하지 않는다.
  const promoteRef = useRef(onPromoteSignal);
  promoteRef.current = onPromoteSignal;
  const jumpRef = useRef(onJumpToCaption);
  jumpRef.current = onJumpToCaption;

  return useMemo(() => {
    const text = paper?.text ?? '';
    if (!text) return null;
    type HighlightRange = { id: string; start: number; end: number; color?: HighlightColor };
    const ranges = (
      (note.highlights ?? [])
        .filter((h) => activeHighlightColor === 'all' || (h.color ?? 'yellow') === activeHighlightColor)
        .map((h): HighlightRange | null => {
          if (
            typeof h.start === 'number' &&
            typeof h.end === 'number' &&
            h.start >= 0 &&
            h.end <= text.length &&
            h.end > h.start
          ) {
            return { id: h.id, start: h.start, end: h.end, color: h.color };
          }
          if (h.text) {
            const idx = text.indexOf(h.text);
            if (idx >= 0) return { id: h.id, start: idx, end: idx + h.text.length, color: h.color };
          }
          return null;
        })
        .filter((range): range is HighlightRange => range !== null)
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
          const style = SIGNAL_STYLE[signal.type];
          parts.push(
            <span
              key={`sig-${s}-${e}`}
              role="button"
              tabIndex={0}
              className={`cursor-pointer border-b-2 border-dashed ${style.className}`}
              title={`${signal.reason} — 클릭하면 '${style.promoteLabel}' 하이라이트로 추가됩니다`}
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
    const boundaries = Array.from(new Set([0, text.length, ...ranges.flatMap((range) => [range.start, range.end])]))
      .filter((offset) => offset >= 0 && offset <= text.length)
      .sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      if (end <= start) continue;
      const activeRanges = ranges.filter((range) => range.start < end && start < range.end);
      if (activeRanges.length === 0) {
        nodes.push(...renderPlainSegment(start, end));
        continue;
      }
      const color = highlightStyle(activeRanges[0].color);
      const focused = focusedHighlightId !== null && activeRanges.some((range) => range.id === focusedHighlightId);
      const uniqueColors = Array.from(new Set(activeRanges.map((range) => range.color ?? 'yellow')));
      const showColorStack = uniqueColors.length > 1;
      nodes.push(
        <mark
          key={`hl-${start}-${end}-${activeRanges.map((range) => range.id).join('-')}`}
          data-highlight-id={activeRanges.map((range) => range.id).join(' ')}
          className={`relative rounded ${color.markClass} text-ink ${
            focused ? 'ring-2 ring-action ring-offset-1' : ''
          }`}
        >
          {text.slice(start, end)}
          {showColorStack && (
            <span
              className="ml-1 inline-flex translate-y-[1px] items-center gap-0.5 align-baseline"
              title={`겹친 하이라이트: ${uniqueColors
                .map((value) => HIGHLIGHT_COLORS.find((colorItem) => colorItem.value === value)?.label ?? value)
                .join(', ')}`}
              aria-label={`겹친 하이라이트 ${uniqueColors.length}개`}
            >
              {uniqueColors.map((value) => (
                <span
                  key={`${start}-${end}-${value}`}
                  className={`size-2 rounded-full border border-white ${
                    HIGHLIGHT_COLORS.find((colorItem) => colorItem.value === value)?.swatchClass ?? 'bg-yellow-300'
                  }`}
                />
              ))}
            </span>
          )}
        </mark>,
      );
    }
    return nodes;
  }, [activeHighlightColor, paper?.text, note.highlights, signals, figureMentions, focusedHighlightId]);
}
