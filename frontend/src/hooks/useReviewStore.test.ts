// @vitest-environment happy-dom
//
// useReviewStore 훅의 핵심 상태/액션 동작 검증. 마운트 시 호출되는 동기화
// fetch(/health·/notes·/ai/status)는 mock 하고, DOM·localStorage가 필요한
// 상태 로직을 happy-dom 환경에서 직접 돌린다. (순수 lib 테스트는 node 환경 유지)
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paper } from '../types';
import { useReviewStore } from './useReviewStore';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paperInput(overrides: Partial<Omit<Paper, 'id'>> = {}): Omit<Paper, 'id'> {
  return {
    title: 'Attention Is All You Need',
    authors: 'Vaswani',
    link: '',
    text: 'body text here',
    sourceKey: 'file:sample',
    ...overrides,
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let active: { unmount: () => void } | null = null;

async function renderStore() {
  const rendered = renderHook(() =>
    useReviewStore({ accessToken: null, authReady: true, authEnabled: false }),
  );
  active = rendered;
  // 마운트 복원/동기화 effect를 먼저 정착시켜 빈 서버 응답({})이
  // 이후 등록 상태를 덮어쓰지 않도록 한다.
  await act(async () => {
    await tick();
  });
  return rendered;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
});

afterEach(() => {
  active?.unmount();
  active = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useReviewStore', () => {
  it('논문을 덮어쓰지 않고 누적 등록한다 (#2)', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput({ title: 'First' }), [], 'p1'));
    act(() => result.current.registerPaper(paperInput({ title: 'Second' }), [], 'p2'));

    expect(Object.keys(result.current.library).sort()).toEqual(['p1', 'p2']);
    expect(result.current.activeId).toBe('p2');
    expect(result.current.library.p1.title).toBe('First');
    expect(result.current.library.p2.title).toBe('Second');
    // 논문마다 자체 노트를 갖는다.
    expect(result.current.notes.p1).toBeDefined();
    expect(result.current.notes.p2).toBeDefined();
  });

  it('활성 노트의 태그를 갱신하고 allTags에 반영한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput(), [], 'p1'));
    act(() => result.current.setTags(['nlp', 'transformer']));

    expect(result.current.note.tags).toEqual(['nlp', 'transformer']);
    expect(result.current.allTags).toEqual(['nlp', 'transformer']);
  });

  it('선택 영역을 본문 오프셋 기반 하이라이트로 추가한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput({ text: 'body text here' }), [], 'p1'));
    act(() => result.current.setHighlightColor('green'));
    act(() => result.current.setSelection({ text: 'body', start: 0, end: 4, x: 0, y: 0 }));
    act(() => result.current.addHighlight());

    expect(result.current.note.highlights).toHaveLength(1);
    const highlight = result.current.note.highlights[0];
    expect(highlight.text).toBe('body');
    expect(highlight.start).toBe(0);
    expect(highlight.end).toBe(4);
    expect(highlight.color).toBe('green');
    // 추가 후 선택은 해제된다.
    expect(result.current.selection).toBeNull();
  });

  it('위치를 해석할 수 없는 선택은 하이라이트하지 않고 경고한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput({ text: 'short' }), [], 'p1'));
    // 본문 길이(5)를 벗어나고 본문에 없는 텍스트 → 해석 실패.
    act(() => result.current.setSelection({ text: 'missing', start: 50, end: 57, x: 0, y: 0 }));
    act(() => result.current.addHighlight());

    expect(result.current.note.highlights).toHaveLength(0);
    expect(result.current.syncNotice?.tone).toBe('warning');
  });

  it('PDF 좌표 기반 하이라이트를 추가한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput(), [], 'p1'));
    act(() => result.current.setHighlightColor('blue'));
    act(() =>
      result.current.addPdfHighlight({
        page: 2,
        text: ' selected   pdf text ',
        rects: [{ x: 10.123, y: 20.456, width: 100.789, height: 12.345 }],
      }),
    );

    expect(result.current.note.highlights).toHaveLength(1);
    const highlight = result.current.note.highlights[0];
    expect(highlight.text).toBe('selected pdf text');
    expect(highlight.start).toBeUndefined();
    expect(highlight.end).toBeUndefined();
    expect(highlight.color).toBe('blue');
    expect(highlight.pdf).toEqual({
      page: 2,
      rects: [{ x: 10.12, y: 20.46, width: 100.79, height: 12.35 }],
    });
  });

  it('선택 영역을 사용자 용어로 추가한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput(), [], 'p1'));
    act(() => result.current.setSelection({ text: 'attention', start: 0, end: 9, x: 0, y: 0 }));
    act(() => result.current.addTerm());

    expect(result.current.note.terms).toHaveLength(1);
    expect(result.current.note.terms[0].term).toBe('attention');
    expect(result.current.note.terms[0].addedByUser).toBe(true);
    expect(result.current.note.terms[0].aiExplained).toBe(false);
  });

  it('태그 필터를 토글한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.toggleTagFilter('nlp'));
    expect(result.current.activeTags).toEqual(['nlp']);
    act(() => result.current.toggleTagFilter('nlp'));
    expect(result.current.activeTags).toEqual([]);
  });

  it('논문을 삭제하면 라이브러리와 활성 상태에서 제거한다', async () => {
    const { result } = await renderStore();
    act(() => result.current.registerPaper(paperInput(), [], 'p1'));
    expect(result.current.activeId).toBe('p1');

    await act(async () => {
      result.current.deletePaper('p1');
      await tick();
    });

    expect(result.current.library.p1).toBeUndefined();
    expect(result.current.notes.p1).toBeUndefined();
    expect(result.current.activeId).toBeNull();
  });
});
