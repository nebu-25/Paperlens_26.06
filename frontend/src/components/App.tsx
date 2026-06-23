import {
  Check,
  Download,
  FileText,
  Highlighter,
  Library,
  PencilLine,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  HIGHLIGHT_COLORS,
  MEMO_SECTIONS,
  SAMPLE_PAPER,
  TEMPLATE_QUESTIONS,
  uploadPhaseText,
} from '../constants';
import { highlightStyle, needsPdfText, noticeStyle } from '../lib/format';
import { uid } from '../lib/notes';
import { useReviewStore } from '../hooks/useReviewStore';
import { AiDraftButton } from './AiDraftButton';
import { EmptyState } from './EmptyState';
import { QuestionsCard } from './QuestionsCard';
import { SectionCard } from './SectionCard';
import { SourceBadge } from './SourceBadge';
import { TagEditor } from './TagEditor';

function App() {
  const {
    library,
    notes,
    activeId,
    paper,
    note,
    doiInput,
    uploading,
    uploadPhase,
    doiLoading,
    uploadNotice,
    uploadOpen,
    savedAt,
    online,
    pending,
    search,
    activeTags,
    allTags,
    visiblePapers,
    mobilePanel,
    highlightColor,
    selection,
    bodyNodes,
    checklist,
    doneCount,
    fileInputRef,
    bodyRef,
    attachTargetRef,
    setDoiInput,
    setUploadNotice,
    setUploadOpen,
    setSearch,
    setMobilePanel,
    setHighlightColor,
    setSelection,
    setNote,
    setSectionSummaries,
    setTags,
    updatePaper,
    updateNote,
    registerPaper,
    openPaper,
    deletePaper,
    handleFile,
    registerByDoi,
    onTextMouseUp,
    addHighlight,
    addTerm,
    toggleTagFilter,
    exportMarkdown,
    exportPdf,
  } = useReviewStore();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-paper text-ink" onMouseDown={() => setSelection(null)}>
      <header className="shrink-0 border-b border-line bg-panel px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded bg-action text-white">
            <FileText size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-none tracking-normal sm:text-3xl">PaperLens</h1>
            <p className="text-xs text-muted">사용자 주도 논문 리뷰 노트</p>
          </div>
          <span className="hidden rounded bg-paper px-3 py-1 text-xs text-muted sm:inline-flex">
            코어 MVP · AI 보조 준비 중
          </span>
        </div>
      </header>

      <section className="shrink-0 border-b border-line bg-panel/95 px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">새 논문 등록</p>
            {paper && (
              <button
                type="button"
                className="rounded border border-line bg-white px-2 py-1 text-xs text-muted sm:hidden"
                onClick={() => setUploadOpen((open) => !open)}
              >
                {uploadOpen ? '접기' : '업로드 열기'}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (file) void handleFile(file);
            }}
          />
          <div className={`${paper && !uploadOpen ? 'hidden sm:mt-2' : 'mt-2 grid'} gap-2 sm:grid sm:grid-cols-[180px_minmax(0,1fr)_86px]`}>
            <button
              className="flex items-center justify-center gap-2 rounded bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                attachTargetRef.current = null;
                fileInputRef.current?.click();
              }}
              disabled={uploading}
            >
              <Upload size={16} />
              {uploading ? uploadPhaseText[uploadPhase] || '처리 중' : 'PDF 업로드'}
            </button>
            <input
              className="min-w-0 rounded border border-line bg-white px-4 py-3 text-sm outline-none focus:border-action disabled:opacity-60"
              placeholder="DOI 또는 URL을 입력하세요"
              value={doiInput}
              disabled={doiLoading || uploading}
              onChange={(e) => setDoiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && registerByDoi()}
            />
            <button
              className="rounded border border-line bg-white px-3 text-sm font-medium disabled:opacity-60"
              onClick={registerByDoi}
              disabled={doiLoading || uploading}
            >
              {doiLoading ? uploadPhaseText[uploadPhase] || '조회 중' : '등록'}
            </button>
          </div>
          <div className={paper && !uploadOpen ? 'hidden sm:block' : ''}>
            <button
              className="mt-2 rounded border border-dashed border-line bg-white px-3 py-2 text-xs text-muted hover:border-action hover:text-action disabled:opacity-60"
              onClick={() => registerPaper(SAMPLE_PAPER)}
              disabled={uploading || doiLoading}
            >
              샘플 논문으로 체험하기
            </button>
            {(uploading || doiLoading) && (
              <div className="mt-3 rounded border border-line bg-white px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{uploadPhaseText[uploadPhase] || '처리 중'}</span>
                  <span>잠시만 기다려 주세요</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                  <div
                    className={`h-full rounded-full bg-action transition-all ${
                      uploadPhase === 'uploading'
                        ? 'w-1/4'
                        : uploadPhase === 'extracting'
                          ? 'w-1/2'
                          : uploadPhase === 'metadata'
                            ? 'w-3/4'
                            : 'w-full'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {uploadNotice && (
            <div
              className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 text-xs leading-relaxed ${
                noticeStyle(uploadNotice.tone)
              }`}
            >
              <span className="flex-1">
                <b className="block">{uploadNotice.title}</b>
                {uploadNotice.message}
              </span>
              <button
                className="shrink-0 leading-none hover:text-ink"
                title="닫기"
                onClick={() => setUploadNotice(null)}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* ── 사이드바 ── */}
        <aside className="max-h-56 overflow-y-auto border-b border-line bg-panel p-4 lg:max-h-none lg:border-b-0 lg:border-r lg:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            내 리뷰 노트 ({visiblePapers.length}/{Object.keys(library).length})
          </p>
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

        {/* ── 본문 ── */}
        {!paper ? (
          <EmptyState />
        ) : (
          <section className="flex min-h-0 flex-col">
            <div className="flex shrink-0 border-b border-line bg-panel p-2 xl:hidden">
              <button
                type="button"
                className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${
                  mobilePanel === 'paper' ? 'bg-action text-white' : 'text-muted'
                }`}
                onClick={() => setMobilePanel('paper')}
              >
                논문
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${
                  mobilePanel === 'review' ? 'bg-action text-white' : 'text-muted'
                }`}
                onClick={() => setMobilePanel('review')}
              >
                리뷰
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
            {/* 원문 패널 */}
            <article
              className={`min-h-0 flex-col border-b border-line bg-white xl:flex xl:border-b-0 xl:border-r ${
                mobilePanel === 'paper' ? 'flex' : 'hidden'
              }`}
            >
              <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold">원문 패널</h2>
                  <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
                </div>
                <p className="text-xs text-muted">
                  문장을 드래그하면 <b>하이라이트</b> 또는 <b>용어 사전 추가</b>를 할 수 있습니다.
                  옅은 밑줄은 전문용어 추정 힌트(보조)입니다.
                </p>
                {needsPdfText(paper) && (
                  <div className="mt-3 rounded border border-sky-300 bg-sky-50 p-3 text-xs leading-relaxed text-sky-800">
                    <div className="mb-2 font-semibold">원문 PDF가 아직 연결되지 않았습니다</div>
                    <p>
                      DOI/URL 등록만으로는 본문 텍스트가 없습니다. PDF를 연결하면 현재 리뷰 노트에
                      원문을 붙여 읽으며 하이라이트할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1 rounded bg-action px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={uploading}
                      onClick={() => {
                        attachTargetRef.current = paper.id;
                        setUploadOpen(true);
                        fileInputRef.current?.click();
                      }}
                    >
                      <Upload size={13} />
                      PDF 본문 연결
                    </button>
                  </div>
                )}
              </div>
              <div
                ref={bodyRef}
                className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 text-sm leading-7 text-neutral-800 sm:px-6"
                onMouseUp={onTextMouseUp}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="select-text whitespace-pre-wrap">
                  {paper.text ? (
                    bodyNodes
                  ) : (
                    <p className="text-xs text-muted">원문을 불러오는 중이거나 본문이 없습니다.</p>
                  )}
                </div>
              </div>
            </article>

            {/* 리뷰 노트 패널 (9영역) */}
            <article
              className={`min-h-0 flex-col bg-paper xl:flex ${
                mobilePanel === 'review' ? 'flex' : 'hidden'
              }`}
            >
              <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">리뷰 노트</h2>
                  <span
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      online ? 'bg-emerald-50 text-emerald-700' : 'bg-paper text-muted'
                    }`}
                    title={
                      online ? '서버에 저장됩니다' : '서버 미연결 — 로컬에만 저장됩니다(복구 시 자동 동기화)'
                    }
                  >
                    <Save size={12} />
                    {savedAt ?? '자동 저장 대기'}
                    {pending > 0 && ` · 미동기 ${pending}건`}
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 sm:px-6">
                {/* 논문 메타정보 (영역 1) — 자동 추출 결과를 직접 수정 가능 */}
                <SectionCard title="논문 메타정보" icon={<FileText size={16} />}>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="w-10 shrink-0 text-xs text-muted">제목</span>
                      <input
                        className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 outline-none focus:border-action"
                        placeholder="논문 제목을 입력하세요"
                        value={paper.title}
                        onChange={(e) => updatePaper({ title: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="w-10 shrink-0 text-xs text-muted">저자</span>
                      <input
                        className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 outline-none focus:border-action"
                        placeholder="저자를 입력하세요 (쉼표로 구분)"
                        value={paper.authors}
                        onChange={(e) => updatePaper({ authors: e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="w-10 shrink-0 text-xs text-muted">링크</span>
                      <input
                        className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 outline-none focus:border-action"
                        placeholder="DOI 또는 URL"
                        value={paper.link}
                        onChange={(e) => updatePaper({ link: e.target.value })}
                      />
                    </label>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="w-10 shrink-0 pt-1.5 text-xs text-muted">태그</span>
                      <div className="min-w-0 flex-1">
                        <TagEditor tags={note.tags} onChange={setTags} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    자동 추출이 비어 있으면 직접 입력하세요. (KCI 등 CrossRef 미등재 논문)
                  </p>
                </SectionCard>

                {/* ── 읽으며 캡처: 원문을 읽으며 바로 남기는 영역 ── */}
                <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  읽으며 캡처
                </p>

                {/* 핵심 문장 하이라이트 (영역 6) */}
                <SectionCard title="핵심 문장 하이라이트" icon={<Highlighter size={16} />}>
                  {note.highlights.length === 0 ? (
                    <p className="text-xs text-muted">
                      원문에서 중요한 문장을 드래그해 추가하세요.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {note.highlights.map((h) => (
                        <li
                          key={h.id}
                          className={`flex items-start justify-between gap-2 rounded p-2 text-sm ${
                            highlightStyle(h.color).listClass
                          }`}
                        >
                          <span>“{h.text}”</span>
                          <button
                            className="shrink-0 text-muted hover:text-ink"
                            onClick={() =>
                              updateNote(
                                'highlights',
                                note.highlights.filter((x) => x.id !== h.id),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                {/* 핵심 용어 사전 (영역 4) */}
                <SectionCard title="핵심 용어 사전" icon={<Library size={16} />}>
                  {note.terms.length === 0 ? (
                    <p className="text-xs text-muted">
                      본문에서 모르는 단어를 드래그해 추가하세요.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {note.terms.map((t) => (
                        <li key={t.id} className="rounded border border-line p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{t.term}</span>
                            <div className="flex items-center gap-2">
                              {t.explanation.length === 0 && <AiDraftButton label="설명 받기" />}
                              <button
                                className="text-muted hover:text-ink"
                                onClick={() =>
                                  updateNote(
                                    'terms',
                                    note.terms.filter((x) => x.id !== t.id),
                                  )
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="min-h-12 w-full resize-none rounded border border-line p-2 text-sm outline-none focus:border-action"
                            placeholder="설명을 직접 작성하세요."
                            value={t.explanation}
                            onChange={(e) =>
                              updateNote(
                                'terms',
                                note.terms.map((x) =>
                                  x.id === t.id ? { ...x, explanation: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                {/* 읽으며 생긴 질문 (영역 5) */}
                <QuestionsCard
                  questions={note.questions}
                  onChange={(q) => updateNote('questions', q)}
                />

                {/* 섹션별 메모 카드 (영역 8) — 상단부 캡처 묶음으로 이동 */}
                <SectionCard title="섹션별 메모 카드" icon={<PencilLine size={16} />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MEMO_SECTIONS.map((s) => (
                      <div key={s}>
                        <label className="mb-1 block text-xs font-semibold text-muted">{s}</label>
                        <textarea
                          className="min-h-20 w-full resize-none rounded border border-line p-2 text-sm outline-none focus:border-action"
                          placeholder={`${s} 메모`}
                          value={note.memos[s] ?? ''}
                          onChange={(e) =>
                            updateNote('memos', { ...note.memos, [s]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </SectionCard>

                {/* ── 내 언어로 정리: 종합 작성 영역 ── */}
                <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  내 언어로 정리
                </p>

                {/* 한 줄 요약 (영역 2) */}
                <SectionCard
                  title="한 줄 요약"
                  icon={<PencilLine size={16} />}
                  action={
                    <div className="flex items-center gap-2">
                      <SourceBadge
                        filled={note.oneLineSummary.length > 0}
                        source={note.oneLineSource}
                      />
                      {note.oneLineSummary.length === 0 && <AiDraftButton />}
                    </div>
                  }
                >
                  <input
                    className="w-full rounded border border-line p-3 text-sm outline-none focus:border-action"
                    placeholder="이 논문을 내 언어로 한 문장으로 정리하세요."
                    value={note.oneLineSummary}
                    onChange={(e) =>
                      setNote((n) => ({
                        ...n,
                        oneLineSummary: e.target.value,
                        oneLineSource: 'user',
                      }))
                    }
                  />
                </SectionCard>

                {/* 요약: 섹션별 요약 ↔ 5문항 템플릿 택1 (영역 3/7 통합, 데이터는 양쪽 보존) */}
                <SectionCard
                  title="요약"
                  icon={<PencilLine size={16} />}
                  action={
                    <div className="inline-flex shrink-0 rounded border border-line p-0.5 text-xs">
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 ${
                          note.summaryMode === 'section' ? 'bg-action text-white' : 'text-muted'
                        }`}
                        onClick={() => updateNote('summaryMode', 'section')}
                      >
                        섹션별 요약
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-0.5 ${
                          note.summaryMode === 'template' ? 'bg-action text-white' : 'text-muted'
                        }`}
                        onClick={() => updateNote('summaryMode', 'template')}
                      >
                        5문항 템플릿
                      </button>
                    </div>
                  }
                >
                  {note.summaryMode === 'section' ? (
                    <div className="space-y-3">
                      {note.sectionSummaries.map((s) => (
                        <div key={s.id} className="rounded border border-line p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <input
                              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none focus:text-action"
                              value={s.section}
                              aria-label="섹션 이름"
                              onChange={(e) =>
                                setSectionSummaries(
                                  note.sectionSummaries.map((x) =>
                                    x.id === s.id ? { ...x, section: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                            <div className="flex shrink-0 items-center gap-2">
                              <SourceBadge filled={s.content.length > 0} source={s.source} />
                              {s.content.length === 0 && <AiDraftButton />}
                              <button
                                className="p-1 text-muted hover:text-ink"
                                title="섹션 삭제"
                                onClick={() =>
                                  setSectionSummaries(
                                    note.sectionSummaries.filter((x) => x.id !== s.id),
                                  )
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="min-h-20 w-full resize-none rounded border border-line p-3 text-sm outline-none focus:border-action"
                            placeholder={`${s.section || '이 섹션'}을(를) 내 언어로 요약하세요.`}
                            value={s.content}
                            onChange={(e) =>
                              setSectionSummaries(
                                note.sectionSummaries.map((x) =>
                                  x.id === s.id
                                    ? { ...x, content: e.target.value, source: 'user' }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                      ))}
                      <button
                        className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-line py-2 text-xs text-muted hover:border-action hover:text-action"
                        onClick={() =>
                          setSectionSummaries([
                            ...note.sectionSummaries,
                            { id: uid(), section: '새 섹션', content: '', source: 'user' },
                          ])
                        }
                      >
                        <Plus size={14} /> 섹션 추가
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {TEMPLATE_QUESTIONS.map((q) => {
                        const val = note.template[q.key];
                        return (
                          <div key={q.key}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="text-sm font-medium">{q.label}</label>
                              {val.length === 0 && <AiDraftButton />}
                            </div>
                            <textarea
                              className="min-h-16 w-full resize-none rounded border border-line p-2 text-sm outline-none focus:border-action"
                              value={val}
                              onChange={(e) =>
                                updateNote('template', { ...note.template, [q.key]: e.target.value })
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>

                {/* 전체 리뷰 노트 (영역 9) — 완성도 체크리스트 */}
                <SectionCard
                  title="전체 리뷰 노트"
                  icon={<FileText size={16} />}
                  action={
                    <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
                      {doneCount}/{checklist.length} 작성
                    </span>
                  }
                >
                  <ul className="space-y-1.5">
                    {checklist.map((c) => (
                      <li key={c.label} className="flex items-center gap-2 text-sm">
                        <span
                          className={`grid size-4 shrink-0 place-items-center rounded-full ${
                            c.done ? 'bg-emerald-500 text-white' : 'border border-line text-transparent'
                          }`}
                        >
                          <Check size={11} />
                        </span>
                        <span className={c.done ? 'text-ink' : 'text-muted'}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex gap-2">
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={exportMarkdown}
                      disabled={doneCount === 0}
                    >
                      <Download size={15} /> Markdown
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                      onClick={exportPdf}
                      disabled={doneCount === 0}
                    >
                      <Printer size={15} /> PDF로 저장
                    </button>
                  </div>
                  {doneCount === 0 && (
                    <p className="mt-2 text-xs text-muted">
                      한 가지 이상 작성하면 내보낼 수 있습니다.
                    </p>
                  )}
                </SectionCard>
              </div>
            </article>
            </div>
          </section>
        )}
      </div>

      {/* 드래그 선택 플로팅 툴바 */}
      {selection && (
        <div
          className="fixed z-50 flex flex-wrap items-center gap-1 rounded border border-line bg-white p-1 shadow-lg"
          style={{ left: selection.x, top: selection.y + 12 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 border-r border-line pr-1">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`size-5 rounded-full border ${
                  highlightColor === color.value ? 'border-ink ring-2 ring-action/30' : 'border-line'
                } ${color.swatchClass}`}
                title={`하이라이트 색상: ${color.label}`}
                aria-label={`하이라이트 색상 ${color.label}`}
                onClick={() => setHighlightColor(color.value)}
              />
            ))}
          </div>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-paper"
            onClick={addHighlight}
          >
            <Highlighter size={14} /> 하이라이트
          </button>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-paper"
            onClick={addTerm}
          >
            <Library size={14} /> 용어 추가
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
