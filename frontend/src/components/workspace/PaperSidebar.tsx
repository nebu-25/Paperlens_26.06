import { PanelLeftClose, PanelLeftOpen, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';

export function PaperSidebar() {
  const {
    library,
    notes,
    activeId,
    visiblePapers,
    search,
    setSearch,
    allTags,
    activeTags,
    toggleTagFilter,
    openPaper,
    deletePaper,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useWorkspace().store;

  // 접힘: 본문을 넓게 쓰도록 얇은 레일만 남기고, 펼치기 버튼을 제공한다.
  // (lg 이상에선 세로 레일, 그 아래에선 가로 슬림 바)
  if (sidebarCollapsed) {
    return (
      <aside className="flex shrink-0 items-center border-b border-line bg-panel p-2 lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
        <button
          type="button"
          className="flex items-center gap-2 rounded p-1 text-muted hover:text-action lg:flex-col"
          title="내 리뷰 노트 펼치기"
          aria-label="내 리뷰 노트 펼치기"
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeftOpen size={18} />
          <span className="text-[11px] font-semibold lg:[writing-mode:vertical-rl]">내 리뷰 노트</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="max-h-56 overflow-y-auto border-b border-line bg-panel p-4 lg:max-h-none lg:border-b-0 lg:border-r lg:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold uppercase tracking-wide text-muted">
          내 리뷰 노트 ({visiblePapers.length}/{Object.keys(library).length})
        </p>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted hover:bg-paper hover:text-action"
          title="내 리뷰 노트 접기 (작업 영역 넓게 보기)"
          aria-label="내 리뷰 노트 접기"
          onClick={() => setSidebarCollapsed(true)}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>
      {Object.keys(library).length === 0 ? (
        <p className="text-xs text-muted">아직 등록된 논문이 없습니다.</p>
      ) : (
        <>
          <div className="relative mb-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              name="paper-library-search"
              type="search"
              aria-label="리뷰 노트 검색"
              title="리뷰 노트 검색"
              className="w-full rounded border border-line bg-white py-1.5 pl-7 pr-2 text-sm outline-none focus:border-action"
              placeholder="제목·저자·내용·태그 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {allTags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTags.includes(tag)
                      ? 'bg-action text-white'
                      : 'border border-line text-muted hover:border-action'
                  }`}
                  onClick={() => toggleTagFilter(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
          {visiblePapers.length === 0 ? (
            <p className="text-xs text-muted">조건에 맞는 노트가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {visiblePapers.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-1 rounded border bg-white px-2 py-2 text-sm ${
                    p.id === activeId ? 'border-action' : 'border-line'
                  }`}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => openPaper(p.id)}>
                    <div className="line-clamp-1 font-medium">{p.title || '(제목 없음)'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">작성중</span>
                      {(notes[p.id]?.tags ?? []).map((tag) => (
                        <span key={tag} className="rounded bg-action/10 px-1.5 py-0.5 text-xs text-action">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </button>
                  <button
                    className="shrink-0 p-1 text-muted hover:text-ink"
                    title="노트 삭제"
                    aria-label={`${p.title || '제목 없는 노트'} 삭제`}
                    onClick={() => deletePaper(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
