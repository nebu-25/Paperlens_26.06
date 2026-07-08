import { FileText, Highlighter, Image, ListTree, PencilLine, ScanSearch, ScanText, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { resolveApiUrl } from '../../constants';
import { scrollToTextOffset } from '../../lib/domText';
import { needsPdfText } from '../../lib/format';
import { buildOutline } from '../../lib/outline';
import { extractionQualityLabel } from '../../lib/paperInputs';
import { SectionCard } from '../SectionCard';
import { PdfViewer } from './PdfViewer';
import { useWorkspace } from './WorkspaceContext';

type PaperViewMode = 'text' | 'pdf';

export function SourcePanel() {
  const { store, accessToken, demoSessionId } = useWorkspace();
  const {
    paper,
    note,
    mobilePanel,
    uploading,
    fileInputRef,
    attachTargetRef,
    setUploadOpen,
    bodyRef,
    bodyNodes,
    onTextMouseUp,
    updatePaper,
    ocrPaper,
    ocrRunning,
    ocrAvailable,
    updateNote,
    setSyncNotice,
    highlightColor,
    setHighlightColor,
    addPdfHighlight,
    addTermText,
    signalScanEnabled,
    setSignalScanEnabled,
    signalScanBlocked,
    signalMatches,
    signalCounts,
    keywordCandidates,
    figureCaptions,
    figureMentionCounts,
    jumpToTextOffset,
  } = store;

  const paperPdfUrl = paper?.pdfUrl ? resolveApiUrl(paper.pdfUrl) : '';
  const [paperViewMode, setPaperViewMode] = useState<PaperViewMode>('text');
  // 섹션 아웃라인 (FR-26, pass 1 훑기) — 감지된 섹션이 2개 이상일 때만 표시
  const outline = useMemo(
    () => buildOutline(paper?.sections, paper?.text?.length ?? 0),
    [paper?.sections, paper?.text],
  );
  const jumpToSection = (start: number) => {
    if (bodyRef.current) scrollToTextOffset(bodyRef.current, start);
  };
  // PDF 그림 이미지 인덱스 (M5b): 페이지별로 묶어 PDF 탭 점프 칩으로 보여준다.
  const [requestedPdfPage, setRequestedPdfPage] = useState<number | null>(null);
  // 캡션↔이미지 매칭(백엔드): 캡션 id -> 그 이미지가 있는 PDF 페이지. 캡션 행의 "PDF 보기" 버튼에 사용.
  const captionImagePage = useMemo(() => {
    const map = new Map<string, { page: number; captionOnly: boolean }>();
    for (const image of paper?.figureImages ?? []) {
      if (image.captionId && !map.has(image.captionId)) {
        map.set(image.captionId, { page: image.page, captionOnly: image.captionOnly === true });
      }
    }
    return map;
  }, [paper?.figureImages]);
  // 칩 목록은 캡션과 매칭되지 않은 이미지만 보여준다(매칭된 이미지는 캡션 행에서 안내).
  const figurePages = useMemo(() => {
    const counts = new Map<number, number>();
    for (const image of paper?.figureImages ?? []) {
      if (image.captionId) continue;
      counts.set(image.page, (counts.get(image.page) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pageNo, count]) => ({ page: pageNo, count }));
  }, [paper?.figureImages]);
  const openPdfAtPage = (pageNo: number) => {
    setPaperViewMode('pdf');
    setRequestedPdfPage(pageNo);
  };
  const [sourceEditOpen, setSourceEditOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  // 그림/표 네비게이터에서 메모 입력을 펼친 캡션 id 집합 (FR-27)
  const [openFigureMemos, setOpenFigureMemos] = useState<Set<string>>(() => new Set());
  const toggleFigureMemo = (id: string) =>
    setOpenFigureMemos((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [hiddenPaperNotices, setHiddenPaperNotices] = useState<Set<string>>(() => new Set());
  const [expandedPaperNotices, setExpandedPaperNotices] = useState<Set<string>>(() => new Set());

  const missingPdfNoticeKey = paper ? `missing-pdf:${paper.id}:${needsPdfText(paper)}` : '';
  const metadataNoticeKey = paper
    ? `metadata:${paper.id}:${paper.extractionQuality?.status ?? ''}:${paper.extractionQuality?.source ?? ''}:${(paper.metadataWarnings ?? []).join('\u001f')}`
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
  const togglePaperNotice = (key: string) => {
    if (!key) return;
    setExpandedPaperNotices((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const missingPdfNoticeHidden = missingPdfNoticeKey
    ? hiddenPaperNotices.has(missingPdfNoticeKey)
    : false;
  const metadataNoticeHidden = metadataNoticeKey ? hiddenPaperNotices.has(metadataNoticeKey) : false;
  const missingPdfNoticeExpanded = missingPdfNoticeKey
    ? expandedPaperNotices.has(missingPdfNoticeKey)
    : false;
  const metadataNoticeExpanded = metadataNoticeKey ? expandedPaperNotices.has(metadataNoticeKey) : false;
  const extractionQuality = paper?.extractionQuality;
  const extractionQualityText = extractionQualityLabel(extractionQuality);
  const shouldShowTextStatusNotice = Boolean(
    paper
      && (
        (paper.metadataWarnings?.length ?? 0) > 0
        || extractionQuality?.source === 'user_edited'
        || (extractionQuality && extractionQuality.status !== 'good')
      ),
  );

  useEffect(() => {
    setPaperViewMode('text');
    setSourceEditOpen(false);
    setSourceDraft(paper?.text ?? '');
  }, [paper?.id, paper?.text]);

  useEffect(() => {
    if (!paperPdfUrl && paperViewMode === 'pdf') setPaperViewMode('text');
  }, [paperPdfUrl, paperViewMode]);

  useEffect(() => {
    if (!sourceEditOpen) setSourceDraft(paper?.text ?? '');
  }, [paper?.text, sourceEditOpen]);

  if (!paper) return null;

  const openSourceEdit = () => {
    setPaperViewMode('text');
    setSourceDraft(paper.text ?? '');
    setSourceEditOpen(true);
  };

  const saveSourceEdit = () => {
    updatePaper({
      text: sourceDraft,
      extractionQuality: {
        score: 100,
        status: 'good',
        reasons: [],
        source: 'user_edited',
      },
    });
    setSourceEditOpen(false);
    setSyncNotice({
      tone: 'info',
      title: '원문 텍스트 저장',
      message:
        '추출 품질: 사용자 보정됨. 직접 입력한 원문이 저장 대상에 포함됩니다. 서버 동기화가 완료되면 로그아웃 후에도 유지됩니다. 저장 상태가 "저장됨"으로 바뀐 뒤 이동하거나 로그아웃하는 것이 안전합니다.',
    });
  };

  return (
    <article
      className={`min-h-0 flex-col border-b border-line bg-white xl:flex xl:border-b-0 xl:border-r ${
        mobilePanel === 'paper' ? 'flex' : 'hidden'
      }`}
    >
      <div className="sticky top-0 z-10 shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">원문 패널</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-line bg-white p-1" aria-label="논문 보기 전환">
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                  paperViewMode === 'text' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
                }`}
                aria-pressed={paperViewMode === 'text'}
                onClick={() => setPaperViewMode('text')}
              >
                <Highlighter size={13} />
                원문
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                  paperViewMode === 'pdf' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
                } disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
                aria-pressed={paperViewMode === 'pdf'}
                disabled={!paperPdfUrl}
                title={paperPdfUrl ? '저장된 PDF 원본 보기' : 'PDF 원본이 연결되면 사용할 수 있습니다'}
                onClick={() => setPaperViewMode('pdf')}
              >
                <FileText size={13} />
                PDF
              </button>
            </div>
            <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
          </div>
        </div>
        {needsPdfText(paper) && !missingPdfNoticeHidden && (
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-w-0 text-left font-semibold hover:underline"
                onClick={() => togglePaperNotice(missingPdfNoticeKey)}
              >
                원문 PDF 연결 필요
                <span className="ml-2 font-normal text-sky-700">
                  {missingPdfNoticeExpanded ? '상세 접기' : '상세 보기'}
                </span>
              </button>
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
            {missingPdfNoticeExpanded && (
              <>
                <p className="mt-2">
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
              </>
            )}
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
        {shouldShowTextStatusNotice && !metadataNoticeHidden && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-w-0 text-left font-semibold hover:underline"
                onClick={() => togglePaperNotice(metadataNoticeKey)}
              >
                원문 상태: {extractionQualityText}
                {extractionQuality ? ` (${extractionQuality.score}/100)` : ''}
                <span className="ml-2 font-normal text-amber-700">
                  {metadataNoticeExpanded ? '상세 접기' : '상세 보기'}
                </span>
              </button>
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
            {metadataNoticeExpanded && extractionQuality && (
              <p className="mt-2">
                추출 품질: {extractionQualityText} ({extractionQuality.score}/100)
                {extractionQuality.source === 'user_edited'
                  ? ' · 사용자가 원문을 직접 보정했습니다.'
                  : ' · 필요하면 PDF 원본과 대조한 뒤 원문을 편집하세요.'}
              </p>
            )}
            {metadataNoticeExpanded && (paper.metadataWarnings?.length ?? 0) > 0 && (
              <>
                <p className="mt-2">
                  PDF에서 일부 수식이나 특수 문자가 텍스트로 정확히 변환되지 않았을 수 있습니다.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {(paper.metadataWarnings ?? []).map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
            {metadataNoticeExpanded && paper.pdfUrl && ocrAvailable && (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 rounded bg-action px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                disabled={ocrRunning}
                onClick={() => {
                  void ocrPaper();
                }}
              >
                <ScanText size={13} />
                {ocrRunning ? 'OCR 재인식 중…' : 'OCR로 다시 시도'}
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 text-sm leading-7 text-neutral-800 sm:px-6"
      >
        {paperViewMode === 'text' ? (
          <>
          <section className="rounded border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">하이라이트 가능한 원문</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">드래그 후 하이라이트/용어 추가</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
                  onClick={openSourceEdit}
                >
                  <PencilLine size={13} />
                  {paper.text ? '텍스트 편집' : '직접 입력'}
                </button>
              </div>
            </div>
            {!sourceEditOpen && outline.length > 0 && (
              <nav
                aria-label="섹션 아웃라인"
                className="mb-3 flex flex-wrap items-center gap-1 rounded border border-line bg-paper/60 p-2"
              >
                <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                  <ListTree size={12} />
                  섹션
                </span>
                {outline.map((entry) => (
                  <button
                    key={`${entry.start}-${entry.title}`}
                    type="button"
                    className={`max-w-44 truncate rounded-full border px-2 py-0.5 text-[11px] ${
                      entry.skimTarget
                        ? 'border-action/50 bg-action/5 font-semibold text-action hover:bg-action/10'
                        : 'border-line text-muted hover:border-action hover:text-action'
                    }`}
                    title={
                      entry.skimTarget
                        ? `${entry.title} — 1차 훑기에서 먼저 읽는 섹션`
                        : entry.title
                    }
                    onClick={() => jumpToSection(entry.start)}
                  >
                    {entry.title}
                  </button>
                ))}
              </nav>
            )}
            {sourceEditOpen ? (
              <div className="space-y-3">
                <textarea
                  name="paper-source-text"
                  aria-label="하이라이트 가능한 원문 편집"
                  title="하이라이트 가능한 원문 편집"
                  className="h-[calc(100vh-23rem)] min-h-[420px] w-full resize-none rounded border border-line bg-paper/40 p-4 text-sm leading-7 outline-none focus:border-action"
                  value={sourceDraft}
                  placeholder="PDF 원본에서 복사한 텍스트를 붙여 넣거나, 추출된 원문을 직접 다듬으세요."
                  onChange={(e) => setSourceDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs leading-relaxed text-muted">
                    저장 후 이 텍스트를 기준으로 하이라이트 위치가 계산됩니다. 서버 동기화 완료 전에는 페이지 이동이나 로그아웃을 잠시 기다려 주세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-line px-3 py-2 text-xs text-muted hover:border-action hover:text-action"
                      onClick={() => {
                        setSourceDraft(paper.text ?? '');
                        setSourceEditOpen(false);
                      }}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="rounded bg-action px-3 py-2 text-xs font-semibold text-white"
                      onClick={saveSourceEdit}
                    >
                      원문 저장
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={bodyRef}
                className="notranslate h-[calc(100vh-21rem)] min-h-[420px] overflow-y-auto rounded border border-line bg-paper/40 p-4"
                translate="no"
                onMouseUp={onTextMouseUp}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="notranslate max-w-[78ch] select-text whitespace-pre-wrap" translate="no">
                  {paper.text ? (
                    bodyNodes
                  ) : (
                    <div className="space-y-3 text-xs leading-relaxed text-muted">
                      <p>원문을 불러오는 중이거나 본문이 없습니다.</p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded bg-action px-3 py-2 font-semibold text-white"
                        onClick={openSourceEdit}
                      >
                        <PencilLine size={13} />
                        원문 직접 입력
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
          {!sourceEditOpen && (figureCaptions.length > 0 || figurePages.length > 0 || paper.text) && (
            <SectionCard
              title="추가 탐색 도구"
              icon={<ScanSearch size={16} />}
              defaultOpen={false}
            >
              <div className="space-y-3">
                {(figureCaptions.length > 0 || figurePages.length > 0) && (
                  <div>
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted">
                      <Image size={12} />
                      {figureCaptions.length > 0
                        ? `그림/표 ${figureCaptions.length}건 — 표적 읽기(2차)에서 결과·그림을 먼저 확인하세요`
                        : 'PDF에서 그림 이미지를 찾았습니다 — 표적 읽기(2차)에서 먼저 확인하세요'}
                    </div>
                    {figurePages.length > 0 && (
                      <div className="mb-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted">PDF 그림 페이지</span>
                        {figurePages.map((entry) => (
                          <button
                            key={entry.page}
                            type="button"
                            className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!paperPdfUrl}
                            title={
                              paperPdfUrl
                                ? `PDF 탭에서 ${entry.page}페이지를 엽니다 (이미지 ${entry.count}개)`
                                : 'PDF 원본이 연결되면 사용할 수 있습니다'
                            }
                            onClick={() => openPdfAtPage(entry.page)}
                          >
                            p.{entry.page}
                            {entry.count > 1 ? ` ×${entry.count}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-1">
                      {figureCaptions.map((caption) => {
                        const memo = note.figureNotes?.[caption.id] ?? '';
                        const memoOpen = openFigureMemos.has(caption.id) || memo.length > 0;
                        const mentions = figureMentionCounts[caption.id] ?? 0;
                        const pdfRef = captionImagePage.get(caption.id);
                        const canOpenPdfFigure = Boolean(paperPdfUrl && pdfRef);
                        return (
                          <li key={caption.id} className="rounded bg-white/70 px-2 py-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-ink">
                                {caption.label}
                              </span>
                              <button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-muted hover:border-action hover:text-action"
                                title={`${caption.label}의 문자 추출 원문 위치로 이동합니다`}
                                onClick={() => jumpToTextOffset(caption.start)}
                              >
                                <ScanText size={11} />
                                원문 위치
                              </button>
                              <button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canOpenPdfFigure}
                                title={
                                  !paperPdfUrl
                                    ? 'PDF 원본이 연결되면 사용할 수 있습니다'
                                    : pdfRef
                                      ? pdfRef.captionOnly
                                        ? `PDF ${pdfRef.page}페이지의 캡션 위치로 이동합니다`
                                        : `PDF ${pdfRef.page}페이지에서 이 그림/표를 봅니다`
                                      : '이 캡션과 매칭된 PDF 그림/표 위치가 없습니다. 원문 위치를 확인하거나 PDF 그림 페이지 칩을 사용하세요.'
                                }
                                onClick={() => {
                                  if (pdfRef) openPdfAtPage(pdfRef.page);
                                }}
                              >
                                <FileText size={11} />
                                {pdfRef ? `PDF p.${pdfRef.page}${pdfRef.captionOnly ? ' 캡션' : ''}` : 'PDF 보기'}
                              </button>
                              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                                {caption.preview}
                              </span>
                              {mentions > 0 && (
                                <span
                                  className="shrink-0 rounded bg-paper px-1.5 py-0.5 text-[10px] text-muted"
                                  title="본문에서 이 그림/표를 언급한 횟수 — 본문 속 링크를 클릭하면 캡션으로 이동합니다"
                                >
                                  언급 {mentions}
                                </span>
                              )}
                              <button
                                type="button"
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                                  memoOpen
                                    ? 'border-action bg-action/10 font-semibold text-action'
                                    : 'border-line text-muted hover:border-action hover:text-action'
                                }`}
                                aria-expanded={memoOpen}
                                onClick={() => toggleFigureMemo(caption.id)}
                              >
                                메모{memo ? ' ●' : ''}
                              </button>
                            </div>
                            {memoOpen && (
                              <textarea
                                name={`figure-note-${caption.id}`}
                                aria-label={`${caption.label} 메모`}
                                title={`${caption.label} 메모 — 그림이 보여주는 것에 대한 내 해석을 직접 적으세요`}
                                className="mt-1 min-h-12 w-full resize-y rounded border border-line p-2 text-xs outline-none focus:border-action"
                                placeholder="이 그림/표에서 확인한 것을 직접 정리하세요. (해석은 도구가 하지 않습니다)"
                                value={memo}
                                onChange={(e) =>
                                  updateNote('figureNotes', {
                                    ...(note.figureNotes ?? {}),
                                    [caption.id]: e.target.value,
                                  })
                                }
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {paper.text && (
                  <div className={`${figureCaptions.length > 0 || figurePages.length > 0 ? 'border-t border-line pt-3' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-muted">
                        <input
                          name="signal-scan-toggle"
                          aria-label="시그널 스캐너 켜기"
                          type="checkbox"
                          className="accent-action"
                          checked={signalScanEnabled}
                          disabled={signalScanBlocked}
                          onChange={(e) => setSignalScanEnabled(e.target.checked)}
                        />
                        <ScanSearch size={12} />
                        시그널 스캐너
                      </label>
                      {signalScanBlocked ? (
                        <span className="text-[11px] text-muted">
                          추출 품질이 낮아 사용할 수 없습니다. 텍스트 편집으로 원문을 보정한 뒤 다시 켜세요.
                        </span>
                      ) : signalScanEnabled ? (
                        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-muted">
                          시그널 <b>{signalMatches.length}</b>건 (관점{' '}
                          <b className="text-indigo-600">{signalCounts.perspective}</b> · 한계{' '}
                          <b className="text-rose-600">{signalCounts.limitation}</b> · 비판{' '}
                          <b className="text-amber-600">{signalCounts.critique}</b>) — 점선 문장을 클릭하면
                          해당 라벨 하이라이트로 추가됩니다
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">
                          규칙 기반 안내(저장 안 함). T4 비판적 검토에서는 기본으로 켜집니다.
                        </span>
                      )}
                    </div>
                    {signalScanEnabled && !signalScanBlocked && keywordCandidates.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] font-semibold text-muted">키워드 후보</span>
                        {keywordCandidates.map((candidate) => (
                          <button
                            key={candidate.term}
                            type="button"
                            className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] text-muted hover:border-action hover:text-action"
                            title={`${candidate.reasons.join(' · ')} — 클릭하면 용어 사전에 추가됩니다`}
                            onClick={() => addTermText(candidate.term)}
                          >
                            + {candidate.term}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          )}
          </>
        ) : (
          <section className="rounded border border-line bg-white p-4">
            <PdfViewer
              title={paper.pdfFilename || paper.title || '저장된 PDF'}
              url={paperPdfUrl}
              accessToken={accessToken}
              demoSessionId={demoSessionId}
              highlights={note.highlights}
              highlightColor={highlightColor}
              onSelectHighlightColor={setHighlightColor}
              onAddHighlight={addPdfHighlight}
              onRemoveHighlight={(highlightId) =>
                updateNote(
                  'highlights',
                  note.highlights.filter((highlight) => highlight.id !== highlightId),
                )
              }
              onAddTerm={addTermText}
              requestedPage={requestedPdfPage}
              onRequestedPageHandled={() => setRequestedPdfPage(null)}
            />
          </section>
        )}
      </div>
    </article>
  );
}
