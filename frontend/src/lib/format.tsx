// 표시용 헬퍼: 하이라이트/알림 스타일, 원문 힌트 렌더(JSX 포함).
import React from 'react';
import { HIGHLIGHT_COLORS, HINT_PATTERN } from '../constants';
import type { HighlightColor, NoticeTone, Paper } from '../types';

export const highlightStyle = (color?: HighlightColor) =>
  HIGHLIGHT_COLORS.find((item) => item.value === color) ?? HIGHLIGHT_COLORS[0];

export const noticeStyle = (tone: NoticeTone) => {
  switch (tone) {
    case 'error':
      return 'border-red-300 bg-red-50 text-red-800';
    case 'success':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
    case 'info':
      return 'border-sky-300 bg-sky-50 text-sky-800';
    case 'warning':
    default:
      return 'border-amber-300 bg-amber-50 text-amber-800';
  }
};

export const needsPdfText = (paper: Paper) =>
  !paper.text ||
  paper.text.startsWith('[DOI 등록]') ||
  paper.text.startsWith('[DOI/URL 등록]') ||
  paper.text.startsWith('[백엔드 미연결]');

// 텍스트 슬라이스에 옅은 밑줄 힌트를 적용한 노드 배열. base는 원문 내 절대 오프셋(키 고유화용).
export function renderHints(text: string, base: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(HINT_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={`hint-${base + start}`} className="border-b border-dotted border-action/60">
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
