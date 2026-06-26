import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Highlighter,
  Library,
  PencilLine,
  Printer,
  Save,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  HIGHLIGHT_COLORS,
  RESEARCH_LINKS,
  TEMPLATE_QUESTIONS,
  resolveApiUrl,
  samplePhasePercent,
  samplePhaseText,
  uploadPhasePercent,
  uploadPhaseText,
} from '../constants';
import { highlightStyle, needsPdfText, noticeStyle } from '../lib/format';
import { useReviewStore } from '../hooks/useReviewStore';
import { useAuthSession } from '../hooks/useAuthSession';
import { AiDraftButton } from './AiDraftButton';
import { AuthControls } from './AuthControls';
import { EmptyState } from './EmptyState';
import { LandingPage } from './LandingPage';
import { QuestionsCard } from './QuestionsCard';
import { SectionCard } from './SectionCard';
import { TagEditor } from './TagEditor';

const SERVICE_ROUTE = 'service_home';

type AppRoute = 'landing' | 'service';

function appBasePath() {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
}

function pathForRoute(route: AppRoute) {
  const base = appBasePath();
  if (route === 'service') return base ? `${base}/${SERVICE_ROUTE}` : `/${SERVICE_ROUTE}`;
  return base ? `${base}/` : '/';
}

function routeFromLocation(): AppRoute {
  const base = appBasePath();
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  const normalized = path.replace(/^\/+|\/+$/g, '');
  return normalized === SERVICE_ROUTE ? 'service' : 'landing';
}

function writeRoute(route: AppRoute, mode: 'push' | 'replace' = 'replace') {
  const nextPath = pathForRoute(route);
  if (window.location.pathname !== nextPath) {
    if (mode === 'push') window.history.pushState(null, '', nextPath);
    else window.history.replaceState(null, '', nextPath);
  }
}

function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((next: AppRoute, mode: 'push' | 'replace' = 'push') => {
    writeRoute(next, mode);
    setRoute(next);
  }, []);

  return { route, navigate };
}

interface ReviewWorkspaceProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  accessToken: string;
}

function ReviewWorkspace({ authEnabled, authReady, user, accessToken }: ReviewWorkspaceProps) {
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
    sampleLoading,
    samplePhase,
    sampleRetryAvailable,
    uploadNotice,
    uploadOpen,
    savedAt,
    online,
    pending,
    syncNotice,
    aiEnabled,
    aiLoadingTermId,
    search,
    activeTags,
    allTags,
    visiblePapers,
    mobilePanel,
    highlightColor,
    highlightFilter,
    selection,
    bodyNodes,
    fileInputRef,
    bodyRef,
    attachTargetRef,
    setDoiInput,
    setUploadNotice,
    setUploadOpen,
    setSearch,
    setMobilePanel,
    setHighlightColor,
    setHighlightFilter,
    setSelection,
    setSyncNotice,
    setTags,
    updatePaper,
    updateNote,
    openPaper,
    deletePaper,
    handleFile,
    handleSamplePdf,
    cancelSamplePdf,
    registerByDoi,
    onTextMouseUp,
    addHighlight,
    addTerm,
    explainTerm,
    toggleTagFilter,
    exportMarkdown,
    exportPdf,
  } = useReviewStore({ accessToken, authReady, authEnabled });
  const paperPdfUrl = paper?.pdfUrl ? resolveApiUrl(paper.pdfUrl) : '';
  const [paperPdfObjectUrl, setPaperPdfObjectUrl] = useState('');
  const [paperPdfPreviewError, setPaperPdfPreviewError] = useState('');
  const uploadPercent = uploadPhasePercent[uploadPhase] ?? 0;
  const samplePercent = samplePhasePercent[samplePhase] ?? 0;
  const sampleStatusText =
    samplePhaseText[samplePhase] || (uploading ? uploadPhaseText[uploadPhase] : '샘플 PDF 준비 중');
  const reviewRoadmap = [
    {
      label: '문제 파악',
      helper: '초록(Abstract)의 첫 1~3문단에서 이 논문이 해결하려는 문제를 찾으세요.',
      done: note.template.q1.trim().length > 0,
    },
    {
      label: '접근법 파악',
      helper: '사용한 방법론, 데이터, 비교 기준을 확인하세요.',
      done: note.template.q2.trim().length > 0,
    },
    {
      label: '결과 확인',
      helper: '내 주장과 같은 결과인지, 반대 결과인지, 인용 근거가 되는지 표시하세요.',
      done: note.template.q3.trim().length > 0 || note.highlights.length > 0,
    },
    {
      label: '비판적 검토',
      helper: '한계, 반대 해석, 방법론상 약점을 정리하세요.',
      done: note.template.q4.trim().length > 0 || note.questions.length > 0,
    },
    {
      label: '정리',
      helper: '내가 이 논문을 인용하는 이유와 핵심 문장을 남기세요.',
      done: note.template.q5.trim().length > 0,
    },
  ];
  const visibleHighlights = note.highlights.filter(
    (h) => highlightFilter === 'all' || (h.color ?? 'yellow') === highlightFilter,
  );
  const reviewDoneCount = reviewRoadmap.filter((step) => step.done).length;
  const nextRoadmapStep = reviewRoadmap.find((step) => !step.done);
  const currentRoadmapStep = nextRoadmapStep ?? reviewRoadmap[reviewRoadmap.length - 1];
  const reviewProgressPercent = Math.round((reviewDoneCount / reviewRoadmap.length) * 100);
  const [hiddenPaperNotices, setHiddenPaperNotices] = useState<Set<string>>(() => new Set());
  const missingPdfNoticeKey = paper ? `missing-pdf:${paper.id}:${needsPdfText(paper)}` : '';
  const metadataNoticeKey = paper
    ? `metadata:${paper.id}:${(paper.metadataWarnings ?? []).join('\u001f')}`
    : '';
  const hidePaperNotice = (key: string) => {
    if (!key) return;
    setHiddenPaperNotices((current) => new Set(current).add(key));
  };
  const showPaperNotice = (key: string) => {
    if (!key) return;
    setHiddenPaperNotices((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };
  const missingPdfNoticeHidden = missingPdfNoticeKey
    ? hiddenPaperNotices.has(missingPdfNoticeKey)
    : false;
  const metadataNoticeHidden = metadataNoticeKey ? hiddenPaperNotices.has(metadataNoticeKey) : false;

  useEffect(() => {
    if (!paperPdfUrl) {
      setPaperPdfObjectUrl('');
      setPaperPdfPreviewError('');
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    setPaperPdfObjectUrl('');
    setPaperPdfPreviewError('');
    (async () => {
      try {
        const res = await fetch(paperPdfUrl, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) {
            setPaperPdfPreviewError(
              res.status === 401
                ? 'PDF 원본 미리보기를 열 수 없습니다. 로그인 세션을 새로고침한 뒤 다시 시도해 주세요.'
                : 'PDF 원본 미리보기를 불러오지 못했습니다. 하이라이트 가능한 원문은 계속 사용할 수 있습니다.',
            );
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPaperPdfObjectUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setPaperPdfPreviewError(
            'PDF 원본 미리보기를 불러오지 못했습니다. 하이라이트 가능한 원문은 계속 사용할 수 있습니다.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, paperPdfUrl]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-paper text-ink" onMouseDown={() => setSelection(null)}>
      <header className={`shrink-0 border-b border-line bg-panel px-4 sm:px-6 ${paper ? 'py-2' : 'py-4'}`}>
        <div className="flex items-center gap-3">
          <div className={`grid place-items-center rounded bg-action text-white ${paper ? 'size-8' : 'size-11'}`}>
            <FileText size={paper ? 18 : 23} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={`font-bold leading-none tracking-normal ${paper ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
              PaperLens
            </h1>
            {!paper && <p className="text-xs text-muted">사용자 주도 논문 리뷰 노트</p>}
          </div>
          <nav
            aria-label="논문 검색 사이트"
            className="hidden items-center gap-1 rounded bg-paper px-2 py-1 text-xs text-muted lg:flex"
          >
            <span className="mr-1 font-semibold text-ink">논문 찾기</span>
            {RESEARCH_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white hover:text-action"
                title={`${link.label}에서 논문 찾기`}
              >
                {link.label}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            ))}
          </nav>
          <span className="hidden rounded bg-paper px-3 py-1 text-xs text-muted sm:inline-flex">
            코어 MVP · {aiEnabled ? 'AI 용어 설명 활성' : 'AI 보조 준비 중'}
          </span>
          <AuthControls enabled={authEnabled} ready={authReady} user={user} variant="compact" />
        </div>
      </header>

      <section className={`shrink-0 border-b border-line bg-panel/95 px-4 sm:px-6 ${paper && !uploadOpen ? 'py-1.5' : 'py-3 sm:py-4'}`}>
        <div className={paper && !uploadOpen ? '' : 'mx-auto max-w-3xl'}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {paper && !uploadOpen ? '새 논문 등록 영역 접힘' : '새 논문 등록'}
            </p>
            {paper && (
              <button
                type="button"
                className="rounded border border-line bg-white px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
                onClick={() => setUploadOpen((open) => !open)}
              >
                {uploadOpen ? '새 논문 등록 접기' : '새 논문 등록 열기'}
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
          <div className={`${paper && !uploadOpen ? 'hidden' : 'mt-2 grid'} gap-2 sm:grid-cols-[150px_180px_minmax(0,1fr)_86px]`}>
            <button
              className="flex items-center justify-center gap-2 rounded border border-dashed border-line bg-white px-3 py-3 text-sm font-semibold text-muted hover:border-action hover:text-action disabled:opacity-60"
              onClick={() => void handleSamplePdf()}
              disabled={uploading || doiLoading || sampleLoading}
            >
              {sampleLoading ? '샘플 준비 중' : '샘플 PDF'}
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => {
                attachTargetRef.current = null;
                fileInputRef.current?.click();
              }}
              disabled={uploading || sampleLoading}
            >
              <Upload size={16} />
              {uploading ? uploadPhaseText[uploadPhase] || '처리 중' : 'PDF 업로드'}
            </button>
            <input
              className="min-w-0 rounded border border-line bg-white px-4 py-3 text-sm outline-none focus:border-action disabled:opacity-60"
              placeholder="DOI 또는 PDF 원문 URL"
              value={doiInput}
              disabled={doiLoading || uploading || sampleLoading}
              onChange={(e) => setDoiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && registerByDoi()}
            />
            <button
              className="rounded border border-line bg-white px-3 text-sm font-medium disabled:opacity-60"
              onClick={registerByDoi}
              disabled={doiLoading || uploading || sampleLoading}
            >
              {doiLoading ? uploadPhaseText[uploadPhase] || '조회 중' : '등록'}
            </button>
          </div>
          <div className={paper && !uploadOpen ? 'hidden' : ''}>
            {(uploading || doiLoading || sampleLoading) && (
              <div className="mt-3 rounded border border-line bg-white px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{sampleLoading ? sampleStatusText : uploadPhaseText[uploadPhase] || '처리 중'}</span>
                  <div className="flex items-center gap-2">
                    <span>{sampleLoading ? `${samplePercent}%` : `${uploadPercent}%`}</span>
                    {sampleLoading && (
                      <button
                        type="button"
                        className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:border-action hover:text-action"
                        onClick={cancelSamplePdf}
                      >
                        취소
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-action transition-all"
                    style={{ width: `${sampleLoading ? samplePercent : uploadPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {uploadNotice && (
            <div
              role={uploadNotice.tone === 'error' ? 'alert' : 'status'}
              aria-live={uploadNotice.tone === 'error' ? 'assertive' : 'polite'}
              className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 text-xs leading-relaxed ${
                noticeStyle(uploadNotice.tone)
              }`}
            >
              <span className="flex-1">
                <b className="block">{uploadNotice.title}</b>
                {uploadNotice.message}
              </span>
              {sampleRetryAvailable && uploadNotice.title === '샘플 PDF 불러오기 실패' && (
                <button
                  type="button"
                  className="shrink-0 rounded border border-current px-2 py-1 font-semibold hover:bg-white/70"
                  onClick={() => void handleSamplePdf()}
                >
                  재시도
                </button>
              )}
              <button
                className="shrink-0 leading-none hover:text-ink"
                title="닫기"
                aria-label="알림 닫기"
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
            <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
            {/* 원문 패널 */}
            <article
              className={`min-h-0 flex-col border-b border-line bg-white xl:flex xl:border-b-0 xl:border-r ${
                mobilePanel === 'paper' ? 'flex' : 'hidden'
              }`}
            >
              <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">원문 패널</h2>
                  <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
                </div>
                {needsPdfText(paper) && !missingPdfNoticeHidden && (
                  <div className="mt-3 rounded border border-sky-300 bg-sky-50 p-3 text-xs leading-relaxed text-sky-800">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="font-semibold">원문 PDF가 아직 연결되지 않았습니다</div>
                      <button
                        type="button"
                        className="shrink-0 leading-none hover:text-ink"
                        title="숨기기"
                        aria-label="원문 PDF 연결 알림 숨기기"
                        onClick={() => hidePaperNotice(missingPdfNoticeKey)}
                      >
                        ×
                      </button>
                    </div>
                    <p>
                      DOI 등록만으로는 본문 텍스트가 없습니다. PDF를 연결하면 현재 리뷰 노트에
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
                {needsPdfText(paper) && missingPdfNoticeHidden && (
                  <button
                    type="button"
                    className="mt-3 rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800 hover:border-sky-400"
                    onClick={() => showPaperNotice(missingPdfNoticeKey)}
                  >
                    원문 PDF 연결 알림 보기
                  </button>
                )}
                {paper.metadataWarnings && paper.metadataWarnings.length > 0 && !metadataNoticeHidden && (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="font-semibold">원문 텍스트 확인 필요</div>
                      <button
                        type="button"
                        className="shrink-0 leading-none hover:text-ink"
                        title="숨기기"
                        aria-label="원문 텍스트 확인 알림 숨기기"
                        onClick={() => hidePaperNotice(metadataNoticeKey)}
                      >
                        ×
                      </button>
                    </div>
                    <p>
                      PDF에서 일부 수식이나 특수 문자가 텍스트로 정확히 변환되지 않았을 수 있습니다.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      {paper.metadataWarnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 text-sm leading-7 text-neutral-800 sm:px-6"
              >
                <section className="rounded border border-line bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">하이라이트 가능한 원문</h3>
                    <span className="text-xs text-muted">드래그 후 하이라이트/용어 추가</span>
                  </div>
                  <div
                    ref={bodyRef}
                    className="notranslate max-h-[62vh] overflow-y-auto rounded border border-line bg-paper/40 p-4"
                    translate="no"
                    onMouseUp={onTextMouseUp}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="notranslate select-text whitespace-pre-wrap" translate="no">
                      {paper.text ? (
                        bodyNodes
                      ) : (
                        <p className="text-xs text-muted">원문을 불러오는 중이거나 본문이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </section>
                {(paperPdfObjectUrl || paperPdfPreviewError) && (
                  <section className="rounded border border-line bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink">PDF 원본 보기</h3>
                        <div className="truncate text-xs text-muted">
                          {paper.pdfFilename || '저장된 PDF'}
                        </div>
                      </div>
                      {paperPdfObjectUrl && (
                        <a
                          className="shrink-0 rounded border border-line px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
                          href={paperPdfObjectUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          새 창
                        </a>
                      )}
                    </div>
                    {paperPdfObjectUrl ? (
                      <iframe
                        className="h-[72vh] min-h-[560px] w-full rounded border border-line bg-paper"
                        title={`${paper.title || '논문'} PDF 원본`}
                        src={paperPdfObjectUrl}
                      />
                    ) : (
                      <div className="rounded border border-line bg-paper p-3 text-xs leading-relaxed text-muted">
                        {paperPdfPreviewError}
                      </div>
                    )}
                  </section>
                )}
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
                  <h2 className="min-w-0 text-base font-semibold">리뷰 노트</h2>
                  <span
                    role="status"
                    aria-live="polite"
                    className={`notranslate inline-flex max-w-[13rem] shrink-0 items-center gap-1 rounded px-2 py-1 text-xs leading-none ${
                      online ? 'bg-emerald-50 text-emerald-700' : 'bg-paper text-muted'
                    }`}
                    translate="no"
                    title={
                      online ? '서버에 저장됩니다' : '서버 미연결 — 로컬에만 저장됩니다(복구 시 자동 동기화)'
                    }
                  >
                    <Save size={12} className="shrink-0" />
                    <span className="min-w-0 truncate">{savedAt ?? '자동 저장 대기'}</span>
                    {pending > 0 && (
                      <span
                        className="ml-1 inline-flex min-w-5 shrink-0 justify-center rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold"
                        title={`미동기 ${pending}건`}
                        aria-label={`미동기 ${pending}건`}
                      >
                        {pending}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-3 rounded border border-line bg-white p-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">리뷰 진행률</span>
                    <span className="text-muted">
                      {reviewDoneCount}/{reviewRoadmap.length} ·{' '}
                      {nextRoadmapStep ? `다음: ${nextRoadmapStep.label}` : '완료'}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-action transition-all"
                      style={{ width: `${reviewProgressPercent}%` }}
                    />
                  </div>
                </div>
                {syncNotice && (
                  <div
                    role={syncNotice.tone === 'error' || syncNotice.tone === 'warning' ? 'alert' : 'status'}
                    aria-live={syncNotice.tone === 'error' || syncNotice.tone === 'warning' ? 'assertive' : 'polite'}
                    className={`mt-3 flex items-start gap-2 rounded border px-3 py-2 text-xs leading-relaxed ${
                      noticeStyle(syncNotice.tone)
                    }`}
                  >
                    <span className="flex-1">
                      <b className="block">{syncNotice.title}</b>
                      {syncNotice.message}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 leading-none hover:text-ink"
                      title="닫기"
                      aria-label="동기화 알림 닫기"
                      onClick={() => setSyncNotice(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 sm:px-6">
                <section className="rounded border border-line bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">리뷰 진행 로드맵</h3>
                    <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
                      {reviewDoneCount}/{reviewRoadmap.length} 단계
                    </span>
                  </div>
                  <ol className="space-y-2">
                    {reviewRoadmap.map((step, index) => (
                      <li
                        key={step.label}
                        className={`flex gap-2 rounded p-2 text-sm ${
                          step === nextRoadmapStep
                            ? 'border border-action/40 bg-action/5'
                            : ''
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                            step.done
                              ? 'bg-emerald-500 text-white'
                              : step === nextRoadmapStep
                                ? 'bg-action text-white'
                                : 'bg-paper text-muted'
                          }`}
                        >
                          {step.done ? <Check size={12} /> : index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={step.done ? 'font-semibold text-ink' : 'font-semibold text-muted'}>
                              {step.label}
                            </span>
                            {step === nextRoadmapStep && (
                              <span className="rounded bg-action px-1.5 py-0.5 text-[11px] font-semibold text-white">
                                다음 단계
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.helper}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 rounded bg-paper p-3 text-xs leading-relaxed text-muted">
                    <b className="mb-1 block text-ink">인용 목적 점검</b>
                    이 논문을 인용하는 이유는 무엇인가요? 내 주장과 같은 결과인지, 반대 결과인지,
                    또는 방법론을 참고하려는지 먼저 정하면 리뷰 방향이 선명해집니다.
                  </div>
                </section>

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
                        placeholder="DOI 또는 PDF 원문 URL"
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

                <SectionCard title="요약 템플릿" icon={<PencilLine size={16} />}>
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
                </SectionCard>

                <QuestionsCard
                  questions={note.questions}
                  onChange={(q) => updateNote('questions', q)}
                />

                {/* 핵심 문장 하이라이트 (영역 6) */}
                <SectionCard title="핵심 문장 하이라이트" icon={<Highlighter size={16} />}>
                  <div className="mb-3 flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={`rounded-full px-2 py-1 text-xs ${
                        highlightFilter === 'all'
                          ? 'bg-action text-white'
                          : 'border border-line text-muted hover:border-action'
                      }`}
                      onClick={() => setHighlightFilter('all')}
                    >
                      전체
                    </button>
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                          highlightFilter === color.value
                            ? 'bg-action text-white'
                            : 'border border-line text-muted hover:border-action'
                        }`}
                        onClick={() => setHighlightFilter(color.value)}
                      >
                        <span className={`size-2 rounded-full ${color.swatchClass}`} />
                        <span>{color.label}</span>
                        <span className={highlightFilter === color.value ? 'text-white/80' : 'text-muted'}>
                          {color.meaning}
                        </span>
                      </button>
                    ))}
                  </div>
                  {visibleHighlights.length === 0 ? (
                    <p className="text-xs text-muted">
                      {note.highlights.length === 0
                        ? '원문에서 중요한 문장을 드래그해 추가하세요.'
                        : '선택한 라벨의 하이라이트가 없습니다.'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {visibleHighlights.map((h) => {
                        const style = highlightStyle(h.color);
                        return (
                          <li
                            key={h.id}
                            className={`flex items-start justify-between gap-2 rounded p-2 text-sm ${
                              style.listClass
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="mb-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                                {style.label} · {style.meaning}
                              </span>
                              <span className="block">“{h.text}”</span>
                            </span>
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
                        );
                      })}
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
                              {t.explanation.length === 0 && (
                                <AiDraftButton
                                  label="설명 받기"
                                  disabled={!aiEnabled}
                                  loading={aiLoadingTermId === t.id}
                                  title={
                                    aiEnabled
                                      ? 'AI가 이 용어의 설명 초안을 생성합니다'
                                      : 'AI 보조 기능은 백엔드 AI_API_KEY 설정 후 사용할 수 있습니다'
                                  }
                                  onClick={() => void explainTerm(t.id)}
                                />
                              )}
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

                {/* 전체 리뷰 노트 (영역 9) — 완성도 체크리스트 */}
                <SectionCard
                  title="전체 리뷰 노트"
                  icon={<FileText size={16} />}
                  action={
                    <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
                      {reviewDoneCount}/{reviewRoadmap.length} 단계
                    </span>
                  }
                >
                  <div className="rounded bg-white text-sm">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted">
                      <span>로드맵 기준 리뷰 완성도</span>
                      <span>{reviewProgressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-action transition-all"
                        style={{ width: `${reviewProgressPercent}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      {nextRoadmapStep ? (
                        <>
                          다음으로 <b className="text-ink">{currentRoadmapStep.label}</b> 단계를 보완하면
                          리뷰가 더 완성됩니다. 완료 기준은 위 로드맵과 동일합니다.
                        </>
                      ) : (
                        <>로드맵 기준 필수 리뷰 단계가 모두 채워졌습니다. 내보내기 전에 문장을 다듬어 주세요.</>
                      )}
                    </p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      onClick={exportMarkdown}
                      disabled={reviewDoneCount === 0}
                    >
                      <Download size={15} /> Markdown
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                      onClick={exportPdf}
                      disabled={reviewDoneCount === 0}
                    >
                      <Printer size={15} /> PDF로 저장
                    </button>
                  </div>
                  {reviewDoneCount === 0 && (
                    <p className="mt-2 text-xs text-muted">
                      로드맵의 한 단계를 시작하면 내보낼 수 있습니다.
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

function App() {
  const { authEnabled, authReady, user, accessToken } = useAuthSession();
  const { route, navigate } = useAppRoute();
  const initialAuthResolvedRef = useRef(false);
  const previousAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (route === 'service' && !accessToken) {
      navigate('landing', 'replace');
    }
  }, [accessToken, authReady, navigate, route]);

  useEffect(() => {
    if (!authReady) return;
    const previousAccessToken = previousAccessTokenRef.current;
    if (!initialAuthResolvedRef.current) {
      initialAuthResolvedRef.current = true;
      previousAccessTokenRef.current = accessToken;
      return;
    }
    previousAccessTokenRef.current = accessToken;
    if (!previousAccessToken && accessToken && route === 'landing') {
      navigate('service', 'push');
    }
  }, [accessToken, authReady, navigate, route]);

  if (route === 'landing' || !accessToken) {
    return (
      <LandingPage
        authEnabled={authEnabled}
        authReady={authReady}
        user={user}
        onEnterService={() => navigate('service')}
      />
    );
  }

  return (
    <ReviewWorkspace
      authEnabled={authEnabled}
      authReady={authReady}
      user={user}
      accessToken={accessToken}
    />
  );
}

export default App;
