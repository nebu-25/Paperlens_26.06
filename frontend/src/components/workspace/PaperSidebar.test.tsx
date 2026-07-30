// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewStore } from '../../hooks/useReviewStore';
import type { Paper } from '../../types';
import { PaperSidebar } from './PaperSidebar';
import { WorkspaceContext } from './WorkspaceContext';

type StoreOverrides = Partial<ReviewStore>;

function paper(over: Partial<Paper> & { id: string }): Paper {
  return { title: '', authors: '', link: '', text: '', ...over };
}

const setSearch = vi.fn();
const toggleTagFilter = vi.fn();
const openPaper = vi.fn();
const deletePaper = vi.fn();
const setSidebarCollapsed = vi.fn();

function baseStore(overrides: StoreOverrides = {}): ReviewStore {
  const store = {
    library: {},
    notes: {},
    activeId: null,
    loaded: true,
    visiblePapers: [],
    search: '',
    setSearch,
    allTags: [],
    activeTags: [],
    toggleTagFilter,
    openPaper,
    deletePaper,
    sidebarCollapsed: false,
    setSidebarCollapsed,
    ...overrides,
  };
  return store as unknown as ReviewStore;
}

function renderSidebar(overrides: StoreOverrides = {}) {
  return render(
    <WorkspaceContext.Provider
      value={{
        store: baseStore(overrides),
        accessToken: '',
        demoSessionId: null,
        requestSurveyPrompt: () => {},
      }}
    >
      <PaperSidebar />
    </WorkspaceContext.Provider>,
  );
}

const PAPER_A = paper({ id: 'a', title: '어텐션 논문' });
const PAPER_B = paper({ id: 'b', title: '' });

afterEach(() => {
  cleanup();
  setSearch.mockClear();
  toggleTagFilter.mockClear();
  openPaper.mockClear();
  deletePaper.mockClear();
  setSidebarCollapsed.mockClear();
});

describe('PaperSidebar empty states', () => {
  it('shows the empty message once loaded with no papers', () => {
    renderSidebar({ library: {}, loaded: true });
    expect(screen.getByText('아직 등록된 논문이 없습니다.')).toBeTruthy();
  });

  it('shows the loading message before notes are loaded', () => {
    renderSidebar({ library: {}, loaded: false });
    expect(screen.getByText('리뷰 노트를 불러오는 중입니다.')).toBeTruthy();
  });

  it('shows a no-match message when a filter hides every paper', () => {
    renderSidebar({
      library: { a: PAPER_A },
      visiblePapers: [],
    });
    expect(screen.getByText('조건에 맞는 노트가 없습니다.')).toBeTruthy();
  });
});

describe('PaperSidebar list rendering', () => {
  it('renders visible papers with a visible/total count and title fallback', () => {
    renderSidebar({
      library: { a: PAPER_A, b: PAPER_B },
      notes: {},
      visiblePapers: [PAPER_A, PAPER_B],
    });
    expect(screen.getByText('내 리뷰 노트 (2/2)')).toBeTruthy();
    expect(screen.getByText('어텐션 논문')).toBeTruthy();
    // 제목이 빈 노트는 대체 라벨을 보여준다.
    expect(screen.getByText('(제목 없음)')).toBeTruthy();
  });

  it('opens a paper when its title button is clicked', () => {
    renderSidebar({ library: { a: PAPER_A }, visiblePapers: [PAPER_A] });
    fireEvent.click(screen.getByText('어텐션 논문'));
    expect(openPaper).toHaveBeenCalledWith('a');
  });

  it('deletes a paper via its labelled delete button', () => {
    renderSidebar({ library: { a: PAPER_A }, visiblePapers: [PAPER_A] });
    fireEvent.click(screen.getByRole('button', { name: '어텐션 논문 삭제' }));
    expect(deletePaper).toHaveBeenCalledWith('a');
  });
});

describe('PaperSidebar search and tag filters', () => {
  it('forwards search input to setSearch', () => {
    renderSidebar({ library: { a: PAPER_A }, visiblePapers: [PAPER_A] });
    fireEvent.change(screen.getByLabelText('리뷰 노트 검색'), {
      target: { value: '어텐션' },
    });
    expect(setSearch).toHaveBeenCalledWith('어텐션');
  });

  it('toggles a tag filter when a tag chip is clicked', () => {
    renderSidebar({
      library: { a: PAPER_A },
      visiblePapers: [PAPER_A],
      allTags: ['cs.CL'],
      activeTags: [],
    });
    fireEvent.click(screen.getByRole('button', { name: '#cs.CL' }));
    expect(toggleTagFilter).toHaveBeenCalledWith('cs.CL');
  });
});

describe('PaperSidebar collapsed rail', () => {
  it('renders only the expand control when collapsed', () => {
    renderSidebar({
      library: { a: PAPER_A },
      visiblePapers: [PAPER_A],
      sidebarCollapsed: true,
    });
    // 접힌 상태에선 목록/검색이 사라지고 펼치기 버튼만 남는다.
    expect(screen.queryByLabelText('리뷰 노트 검색')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '내 리뷰 노트 펼치기' }));
    expect(setSidebarCollapsed).toHaveBeenCalledWith(false);
  });
});
