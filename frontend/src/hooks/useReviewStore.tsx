// PaperLens 핵심 상태/영속화/액션 훅. App 컴포넌트의 모든 비-뷰 로직을 담는다.
// 논문 라이브러리·노트 상태, 서버/로컬 동기화, 업로드·등록·하이라이트·내보내기 액션을 제공한다.
import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, resolveApiUrl } from '../constants';
import { apiErrorFromResponse, classifyApiException, throwApiResponseError } from '../lib/apiErrors';
import { citationSuggestionFields } from '../lib/citationDefaults';
import { buildMarkdown, buildPrintHtml, safeFilename } from '../lib/export';
import type { ExportOptions } from '../lib/export';
import { authHeaders as buildAuthHeaders } from '../lib/authHeaders';
import { collectTags, filterPapers } from '../lib/library';
import {
  EMPTY_NOTE,
  detectedSectionNames,
  fileSourceKey,
  mergeTags,
  sectionSummariesFromDetected,
  uid,
} from '../lib/notes';
import { buildChecklist, countDone } from '../lib/reviewProgress';
import { buildKeywordCandidates, scanSignals } from '../lib/signalScanner';
import type { SignalMatch, SignalType } from '../lib/signalScanner';
import { buildFigureIndex, mentionCounts } from '../lib/figureIndex';
import type { FigureMentionLink } from '../lib/figureIndex';
import { scrollToTextOffset } from '../lib/domText';
import {
  isLikelyDoi,
  isLocalFileReference,
  isPdfUrl,
  normalizeExtractionQuality,
  sampleFilenameFromResponse,
  withExtractionQualityMessage,
} from '../lib/paperInputs';
import type { ExtractionQualityResponse } from '../lib/paperInputs';
import type {
  AppNotice,
  DetectedSection,
  FigureImageRef,
  HighlightColor,
  Paper,
  ReviewNote,
  SamplePhase,
  SectionSummary,
  UploadPhase,
} from '../types';
import { usePaperBodyNodes } from './usePaperBodyNodes';
import { useReviewPersistence } from './useReviewPersistence';

// 시그널 승격 시 붙는 의미 라벨 색: 관점→주장(yellow), 한계·비판→한계/비판(pink).
const SIGNAL_PROMOTE_COLOR: Record<SignalType, HighlightColor> = {
  limitation: 'pink',
  critique: 'pink',
  perspective: 'yellow',
};

const OCR_REQUEST_TIMEOUT_MS = 120_000;
const OCR_BATCH_PAGE_COUNT = 1;
const SAMPLE_HEALTH_TIMEOUT_MS = 10_000;
const SAMPLE_DOWNLOAD_TIMEOUT_MS = 30_000;
const PDF_EXTRACT_TIMEOUT_MS = 90_000;
const SAMPLE_SOURCE_KEYS = new Set(['sample:paperlens', 'demo-session:demo-paperlens-sample-pdf']);

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(timeoutMessage);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

function ocrRequestFailureNotice(error: unknown): Pick<AppNotice, 'title' | 'message'> {
  const apiError = classifyApiException(error, 'OCR 재인식 요청을 완료하지 못했습니다.');
  if (apiError.kind === 'timeout') {
    return {
      title: 'OCR 요청 시간 초과',
      message:
        'OCR 처리가 오래 걸려 요청을 중단했습니다. 페이지 수가 많은 PDF라면 일부 원문을 직접 입력하거나 잠시 후 다시 시도해 주세요.',
    };
  }
  if (apiError.kind === 'cors_or_network' || apiError.kind === 'network') {
    return {
      title: 'OCR 연결 실패',
      message:
        'OCR 처리 중 서버 연결이 끊겼습니다. Render 백엔드가 재시작 중이거나 OCR 작업 시간이 길어진 경우일 수 있습니다. 잠시 후 다시 시도하고, 계속되면 PDF 원본을 보며 직접 입력해 주세요.',
    };
  }
  return {
    title: apiError.title,
    message: apiError.message,
  };
}

export function useReviewStore({
  accessToken,
  authReady,
  authEnabled,
  userId = null,
  demoSessionId = null,
}: {
  accessToken: string | null;
  authReady: boolean;
  authEnabled: boolean;
  userId?: string | null;
  demoSessionId?: string | null;
}) {
  // 논문별로 보관: library[id] = 논문, notes[id] = 그 논문의 리뷰 노트
  const [library, setLibrary] = useState<Record<string, Paper>>({});
  const [notes, setNotes] = useState<Record<string, ReviewNote>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doiInput, setDoiInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrAvailable, setOcrAvailable] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [doiLoading, setDoiLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [samplePhase, setSamplePhase] = useState<SamplePhase>('idle');
  const [sampleRetryAvailable, setSampleRetryAvailable] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<AppNotice | null>(null); // 업로드 가드 오류/안내
  const [uploadOpen, setUploadOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'paper' | 'review'>('paper');
  // "내 리뷰 노트" 사이드바를 접어 본문(원문+리뷰) 영역을 넓게 쓰는 상태.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
  const [highlightFilter, setHighlightFilter] = useState<HighlightColor | 'all'>('all');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoadingTermId, setAiLoadingTermId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    text: string;
    start: number;
    end: number;
    x: number;
    y: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const attachTargetRef = useRef<string | null>(null);
  const sampleAbortRef = useRef<AbortController | null>(null);
  const refreshedStructureIndexRef = useRef<Set<string>>(new Set());

  const paper = activeId ? library[activeId] ?? null : null;
  const note = (activeId ? notes[activeId] : undefined) ?? EMPTY_NOTE;

  const {
    loaded,
    savedAt,
    setSavedAt,
    restorePhase,
    restoreElapsedSeconds,
    online,
    pending,
    syncing,
    retryCountdown,
    syncNotice,
    setSyncNotice,
    libraryRef,
    notesRef,
    activeIdRef,
    markDirty,
    forgetDirty,
    queueDelete,
    flush,
    retryNow,
  } =
    useReviewPersistence({
      library,
      notes,
      activeId,
      setLibrary,
      setNotes,
      setActiveId,
      accessToken,
      authReady,
      authEnabled,
      userId,
      demoSessionId,
    });

  const authHeaders: Record<string, string> = buildAuthHeaders(accessToken, demoSessionId);

  useEffect(() => {
    if (!uploadNotice || (uploadNotice.tone !== 'success' && uploadNotice.tone !== 'info')) return;
    const handle = window.setTimeout(() => setUploadNotice(null), uploadNotice.tone === 'success' ? 4000 : 6000);
    return () => window.clearTimeout(handle);
  }, [uploadNotice]);

  // ── 활성 논문의 노트만 갱신 ──
  function setNote(updater: (n: ReviewNote) => ReviewNote) {
    if (!activeId) return;
    markDirty(activeId);
    setNotes((all) => ({ ...all, [activeId]: updater(all[activeId] ?? EMPTY_NOTE) }));
  }

  const setSectionSummaries = (next: SectionSummary[]) =>
    setNote((n) => ({ ...n, sectionSummaries: next }));

  const setTags = (next: string[]) => setNote((n) => ({ ...n, tags: next }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/ai/status`);
        if (!res.ok) throw new Error('AI status unavailable');
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setAiEnabled(Boolean(data.enabled));
      } catch {
        if (!cancelled) setAiEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 서버가 OCR 재추출(opt-in)을 지원하는지 확인해 버튼 노출을 제어한다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/diagnostics`);
        if (!res.ok) throw new Error('diagnostics unavailable');
        const data = (await res.json()) as { ocr?: { enabled?: boolean } };
        if (!cancelled) setOcrAvailable(Boolean(data.ocr?.enabled));
      } catch {
        if (!cancelled) setOcrAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 활성 논문의 메타정보(제목/저자/링크) 직접 편집 — 자동 추출 실패 시 보완
  function updatePaper(patch: Partial<Omit<Paper, 'id'>>) {
    if (!activeId) return;
    markDirty(activeId, { includeText: typeof patch.text === 'string' });
    setLibrary((lib) => (lib[activeId] ? { ...lib, [activeId]: { ...lib[activeId], ...patch } } : lib));
  }

  useEffect(() => {
    if (!authReady || !paper?.id || !paper.pdfUrl) return;
    if (refreshedStructureIndexRef.current.has(paper.id)) return;
    refreshedStructureIndexRef.current.add(paper.id);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/papers/${paper.id}/structure-index`, {
          method: 'POST',
          headers: authHeaders,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { figure_images?: FigureImageRef[] };
        if (cancelled || !Array.isArray(data.figure_images)) return;
        setLibrary((lib) => {
          const current = lib[paper.id];
          if (!current) return lib;
          return {
            ...lib,
            [paper.id]: {
              ...current,
              figureImages: data.figure_images,
            },
          };
        });
      } catch {
        /* 기존 PDF 구조 인덱스 보강 실패는 편집 흐름을 막지 않는다. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, paper?.id, paper?.pdfUrl, accessToken, demoSessionId]);

  // 손상/스캔 PDF: 저장된 PDF 원본을 서버에서 렌더→OCR로 재인식해 원문을 복구한다.
  async function ocrPaper() {
    const target = paper;
    if (!target || ocrRunning) return;
    if (!target.pdfUrl) {
      setSyncNotice({
        tone: 'warning',
        title: 'OCR을 사용할 수 없음',
        message: 'OCR은 저장된 PDF 원본이 필요합니다. 먼저 PDF를 연결해 주세요.',
      });
      return;
    }
    setOcrRunning(true);
    setSyncNotice({
      tone: 'info',
      title: 'OCR 재인식 중',
      message: 'PDF를 페이지 단위로 렌더해 텍스트를 다시 읽고 있습니다.',
    });
    const chunks: string[] = [];
    let nextPage = 1;
    let totalPages = target.pageCount ?? 0;
    let maxPages = target.pageCount ?? 10;
    let lastQuality: ExtractionQualityResponse | undefined;
    let stoppedByError: Pick<AppNotice, 'title' | 'message'> | null = null;
    try {
      for (;;) {
        setSyncNotice({
          tone: 'info',
          title: 'OCR 재인식 중',
          message: `PDF ${nextPage}페이지를 OCR로 읽고 있습니다. 한 번에 한 페이지씩 처리해 서버 메모리 사용을 줄입니다.`,
        });
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), OCR_REQUEST_TIMEOUT_MS);
        let res: Response;
        try {
          const params = new URLSearchParams({
            start_page: String(nextPage),
            page_count: String(OCR_BATCH_PAGE_COUNT),
          });
          res = await fetch(`${API_BASE}/papers/${target.id}/ocr?${params.toString()}`, {
            method: 'POST',
            headers: authHeaders,
            signal: controller.signal,
          });
        } catch (error) {
          stoppedByError = ocrRequestFailureNotice(error);
          break;
        } finally {
          window.clearTimeout(timer);
        }
        if (!res.ok) {
          const apiError = await apiErrorFromResponse(res, 'OCR 재인식에 실패했습니다.');
          stoppedByError =
            res.status === 503
              ? {
                  title: 'OCR 미지원 서버',
                  message:
                    'OCR 재인식이 비활성화된 서버입니다. 대신 PDF 원본을 보며 원문 텍스트를 직접 입력할 수 있습니다.',
                }
              : { title: apiError.title, message: apiError.message };
          break;
        }
        const data: {
          text?: string;
          page_count?: number;
          processed_pages?: number;
          max_pages?: number;
          has_more?: boolean;
          extraction_quality?: ExtractionQualityResponse;
        } = await res.json();
        if (data.text?.trim()) chunks.push(data.text.trim());
        if (typeof data.page_count === 'number') totalPages = data.page_count;
        if (typeof data.max_pages === 'number') maxPages = data.max_pages;
        lastQuality = data.extraction_quality;
        const processed = Math.max(1, data.processed_pages ?? OCR_BATCH_PAGE_COUNT);
        nextPage += processed;
        if (!data.has_more) break;
      }
      const combinedText = chunks.join('\n\n').trim();
      if (!combinedText) {
        setSyncNotice({
          tone: stoppedByError ? 'error' : 'warning',
          title: stoppedByError?.title ?? 'OCR 결과 없음',
          message:
            stoppedByError?.message ??
            'OCR로 읽어낸 텍스트가 없습니다. PDF 원본을 보며 직접 입력해 주세요.',
        });
        return;
      }
      const extractionQuality = normalizeExtractionQuality(lastQuality);
      // OCR이 오래 걸려 그 사이 다른 논문으로 전환됐을 수 있으므로 id 기준으로 반영한다.
      setLibrary((lib) =>
        lib[target.id]
          ? {
              ...lib,
              [target.id]: {
                ...lib[target.id],
                text: combinedText,
                sections: [],
                pageCount: totalPages || lib[target.id].pageCount,
                extractionQuality,
              },
            }
          : lib,
      );
      markDirty(target.id, { includeText: true });
      setSyncNotice({
        tone: stoppedByError ? 'warning' : 'success',
        title: stoppedByError ? 'OCR 일부 반영' : 'OCR 재인식 완료',
        message: withExtractionQualityMessage(
          stoppedByError
            ? `앞 ${chunks.length}페이지 OCR 결과를 먼저 반영했습니다. ${stoppedByError.message}`
            : `OCR로 복구한 원문을 반영했습니다. 최대 ${Math.min(totalPages || maxPages, maxPages)}페이지까지 페이지 단위로 처리했습니다. 인식 오류가 있을 수 있으니 PDF 원본과 대조해 필요하면 편집하세요.`,
          extractionQuality,
        ),
      });
    } catch (error) {
      const failure = ocrRequestFailureNotice(error);
      setSyncNotice({
        tone: 'error',
        title: failure.title,
        message: failure.message,
      });
    } finally {
      setOcrRunning(false);
    }
  }

  // ── 논문 등록 (#2: 논문별로 누적, 덮어쓰지 않음) ──
  function registerPaper(next: Omit<Paper, 'id'>, initialTags: string[] = [], id = uid()) {
    const nextPaper = { ...next, id };
    const nextNote = {
      ...EMPTY_NOTE,
      tags: mergeTags([], initialTags),
      sectionSummaries: sectionSummariesFromDetected(next.sections),
    };
    libraryRef.current = { ...libraryRef.current, [id]: nextPaper };
    notesRef.current = { ...notesRef.current, [id]: nextNote };
    setLibrary((l) => ({ ...l, [id]: nextPaper }));
    // 논문마다 자체 섹션 배열을 갖도록 새 노트를 생성한다.
    // 자동 감지된 섹션이 있으면 그것으로 요약 카드를 시드한다(#6).
    setNotes((n) => ({
      ...n,
      [id]: nextNote,
    }));
    markDirty(id, { includeText: Boolean(next.text) });
    setActiveId(id);
    setMobilePanel('paper');
    setUploadOpen(false);
    setSelection(null);
    setSavedAt(null);
  }

  function openPaper(id: string) {
    setActiveId(id);
    setMobilePanel('paper');
    setSelection(null);
    setSavedAt('복원됨');
  }

  // ── 취합 항목 → 원본 노트 역링크 (FR-25 후속) ──
  // 취합 뷰에서 항목을 클릭하면 해당 논문을 열고, 하이라이트면 원문 위치로 스크롤 + 잠시 강조한다.
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);

  function openAggregatedItem(paperId: string, itemId: string) {
    openPaper(paperId);
    // 라벨 필터에 가려 대상 하이라이트가 렌더되지 않는 일을 방지
    setHighlightFilter('all');
    setFocusHighlightId(itemId);
  }

  useEffect(() => {
    if (!focusHighlightId || !paper) return;
    const target = note.highlights.find((h) => h.id === focusHighlightId);
    if (!target) {
      // 수동 요약 항목은 원문 오프셋이 없어 논문 전환까지만 안내한다.
      setFocusHighlightId(null);
      return;
    }
    const start =
      typeof target.start === 'number'
        ? target.start
        : target.text
          ? paper.text.indexOf(target.text)
          : -1;
    // 논문 전환 직후 원문 DOM이 그려질 시간을 준 뒤 스크롤한다.
    const jumpTimer = window.setTimeout(() => {
      if (start >= 0) jumpToTextOffset(start);
    }, 200);
    // 강조 표시는 잠시 유지 후 해제
    const clearTimer = window.setTimeout(() => setFocusHighlightId(null), 2500);
    return () => {
      window.clearTimeout(jumpTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusHighlightId, paper?.id]);

  function deletePaper(id: string) {
    forgetDirty(id);
    const nextLibrary = { ...libraryRef.current };
    const nextNotes = { ...notesRef.current };
    delete nextLibrary[id];
    delete nextNotes[id];
    libraryRef.current = nextLibrary;
    notesRef.current = nextNotes;
    if (activeIdRef.current === id) activeIdRef.current = null;
    queueDelete(id);
    setLibrary(nextLibrary);
    setNotes(nextNotes);
    setActiveId((cur) => (cur === id ? null : cur));
    setSavedAt('삭제 대기 중');
    setSyncNotice({
      tone: 'info',
      title: '노트 삭제 예약',
      message: '서버에 삭제 요청을 보냅니다. 연결이 불안정하면 자동으로 다시 시도합니다.',
    });
    void flush();
  }

  function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  async function handleFile(
    file: File,
    options: {
      signal?: AbortSignal;
      onPhase?: (phase: UploadPhase) => void;
      sourceKeyOverride?: string;
    } = {},
  ) {
    setUploadNotice(null);
    const sourceKey = options.sourceKeyOverride ?? fileSourceKey(file);
    const attachTargetId = attachTargetRef.current;
    const duplicate = Object.values(libraryRef.current).find((p) => p.sourceKey === sourceKey);
    if (duplicate) {
      attachTargetRef.current = null;
      setActiveId(duplicate.id);
      setMobilePanel('paper');
      setUploadOpen(false);
      setUploadNotice({
        tone: 'info',
        title: '이미 등록된 PDF',
        message: '새 노트를 만들지 않고 기존 리뷰 노트를 열었습니다.',
      });
      return;
    }
    // 클라이언트 사전 검사(50MB) — 대용량을 업로드하기 전에 차단
    if (file.size > 50 * 1024 * 1024) {
      setUploadNotice({
        tone: 'error',
        title: '파일 크기 초과',
        message: 'PDF 파일은 최대 50MB까지 업로드할 수 있습니다.',
      });
      return;
    }
    setUploading(true);
    setUploadPhase('uploading');
    options.onPhase?.('uploading');
    try {
      const form = new FormData();
      const uploadPaperId = attachTargetId ?? uid();
      form.append('file', file);
      form.append('paper_id', uploadPaperId);
      setUploadPhase('extracting');
      options.onPhase?.('extracting');
      const res = await fetchWithTimeout(`${API_BASE}/papers/extract-text`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
        signal: options.signal,
      }, PDF_EXTRACT_TIMEOUT_MS, 'PDF 텍스트 추출이 오래 걸려 중단했습니다. 잠시 후 다시 시도하거나 다른 PDF로 확인해 주세요.');
      if (!res.ok) {
        // 입력 가드 위반(크기/암호/페이지 등): 서버 메시지를 표시하고 등록하지 않는다
        const apiError = await apiErrorFromResponse(res, '업로드를 처리할 수 없습니다.');
        setUploadNotice({
          tone: 'error',
          title: res.status === 413 ? '업로드 제한 초과' : apiError.title,
          message: apiError.message,
        });
        return;
      }
      setUploadPhase('metadata');
      options.onPhase?.('metadata');
      const data: {
        filename: string;
        text: string;
        title?: string;
        authors?: string;
        link?: string;
        doi?: string;
        sections?: DetectedSection[];
        figure_images?: FigureImageRef[];
        suggested_tags?: string[];
        metadata_source?: string;
        metadata_confidence?: string;
        metadata_warnings?: string[];
        extraction_quality?: ExtractionQualityResponse;
        pdf_url?: string;
        pdf_filename?: string;
        page_count?: number;
        scanned?: boolean;
        notice?: string | null;
      } = await res.json();
      const unknownTitle = !data.title || data.title === '(제목 없음)';
      const unknownAuthors = !data.authors || data.authors === '저자 미상';
      const suggestedTags = data.suggested_tags ?? [];
      const pdfUrl = data.pdf_url ? resolveApiUrl(data.pdf_url) : '';
      const metadataWarnings = data.notice
        ? [...(data.metadata_warnings ?? []), data.notice]
        : (data.metadata_warnings ?? []);
      const extractionQuality = normalizeExtractionQuality(data.extraction_quality);
      setUploadPhase('creating');
      options.onPhase?.('creating');
      if (attachTargetId && libraryRef.current[attachTargetId]) {
        setLibrary((lib) => {
          const current = lib[attachTargetId];
          if (!current) return lib;
          return {
            ...lib,
            [attachTargetId]: {
              ...current,
              title: current.title || (unknownTitle ? file.name.replace(/\.pdf$/i, '') : (data.title ?? '')),
              authors: current.authors || (unknownAuthors ? '' : (data.authors ?? '')),
              link: current.link || data.link || '',
              doi: current.doi || data.doi || '',
              sourceKey,
              suggestedTags: mergeTags(current.suggestedTags ?? [], suggestedTags),
              metadataSource: data.metadata_source,
              metadataConfidence: data.metadata_confidence,
              metadataWarnings,
              extractionQuality,
              pdfUrl: pdfUrl || current.pdfUrl || '',
              pdfFilename: data.pdf_filename || current.pdfFilename || '',
              pageCount: data.page_count ?? current.pageCount,
              sections: data.sections ?? current.sections,
              figureImages: data.figure_images ?? current.figureImages,
              text: data.text || current.text,
            },
          };
        });
        setNotes((all) => {
          const current = all[attachTargetId] ?? EMPTY_NOTE;
          // 사용자가 아직 섹션 요약을 쓰지 않았을 때만 감지된 섹션으로 카드를 교체한다(#6).
          const noSummaryYet = current.sectionSummaries.every((x) => !x.content.trim());
          const seeded = detectedSectionNames(data.sections).length > 0;
          return {
            ...all,
            [attachTargetId]: {
              ...current,
              tags: mergeTags(current.tags ?? [], suggestedTags),
              sectionSummaries:
                noSummaryYet && seeded
                  ? sectionSummariesFromDetected(data.sections)
                  : current.sectionSummaries,
            },
          };
        });
        markDirty(attachTargetId, { includeText: Boolean(data.text) });
        setActiveId(attachTargetId);
        setMobilePanel('paper');
        setUploadOpen(false);
      } else {
        registerPaper({
          title: unknownTitle ? file.name.replace(/\.pdf$/i, '') : (data.title ?? ''),
          authors: unknownAuthors ? '' : (data.authors ?? ''),
          link: data.link || '',
          doi: data.doi || '',
          sourceKey,
          suggestedTags,
          metadataSource: data.metadata_source,
          metadataConfidence: data.metadata_confidence,
          metadataWarnings,
          extractionQuality,
          pdfUrl,
          pdfFilename: data.pdf_filename || '',
          pageCount: data.page_count,
          sections: data.sections ?? [],
          figureImages: data.figure_images ?? [],
          text: data.text || '',
        }, suggestedTags, uploadPaperId);
      }
      // 스캔/OCR 필요 또는 폰트 인코딩 문제로 추출 품질이 낮으면 안내를 노출한다.
      if (data.notice) {
        setUploadNotice({
          tone: 'warning',
          title: data.scanned ? '스캔 PDF로 보입니다' : '원문 텍스트 확인 필요',
          message: withExtractionQualityMessage(data.notice, extractionQuality),
        });
      } else {
        const sectionCount = detectedSectionNames(data.sections).length;
        // 새 노트일 때만 카드를 시드하므로 그 경우에만 안내한다.
        const sectionNote =
          !attachTargetId && sectionCount
            ? ` 감지된 섹션 ${sectionCount}개로 요약 카드를 구성했습니다.`
            : '';
        setUploadNotice({
          tone: 'success',
          title: attachTargetId ? 'PDF 본문 연결 완료' : 'PDF 등록 완료',
          message:
            withExtractionQualityMessage((attachTargetId
              ? '현재 리뷰 노트에 원문 텍스트를 연결했습니다.'
              : '원문 텍스트와 메타정보를 반영해 새 리뷰 노트를 만들었습니다.') + sectionNote, extractionQuality),
        });
      }
    } catch (error) {
      if (isAbortError(error)) {
        setUploadNotice({
          tone: 'info',
          title: '샘플 PDF 취소됨',
          message: '진행 중이던 샘플 PDF 처리를 중단했습니다.',
        });
        return;
      }
      // 네트워크/백엔드 미연결: 등록 흐름은 끊기지 않게 폴백
      const apiError = classifyApiException(error, 'PDF 텍스트 추출 서버에 연결하지 못했습니다.');
      if (!attachTargetId) {
        registerPaper({
          title: file.name.replace(/\.pdf$/i, ''),
          authors: '',
          link: '',
          sourceKey,
          text: '[백엔드 미연결] PDF 텍스트 추출 API에 연결되지 않아 본문을 표시할 수 없습니다. 백엔드(uvicorn)를 실행하면 추출됩니다. 그동안에도 노트 작성은 정상 동작합니다.',
        });
      }
      setUploadNotice({
        tone: 'error',
        title: apiError.title,
        message: attachTargetId
          ? `${apiError.message} 현재 노트는 그대로 유지됩니다.`
          : `${apiError.message} 노트는 생성했지만 원문은 나중에 다시 연결해야 합니다.`,
      });
    } finally {
      setUploading(false);
      setUploadPhase('idle');
      attachTargetRef.current = null;
    }
  }

  async function handleSamplePdf() {
    if (sampleLoading) return;
    const existingSample = Object.values(libraryRef.current).find((p) => SAMPLE_SOURCE_KEYS.has(p.sourceKey ?? ''));
    if (existingSample) {
      setActiveId(existingSample.id);
      setMobilePanel('paper');
      setUploadOpen(false);
      setUploadNotice({
        tone: 'info',
        title: '이미 등록된 샘플 PDF',
        message: '새 노트를 만들지 않고 기존 샘플 리뷰 노트를 열었습니다.',
      });
      return;
    }
    const controller = new AbortController();
    sampleAbortRef.current = controller;
    setSampleRetryAvailable(false);
    setSampleLoading(true);
    setSamplePhase('waking');
    setUploadNotice({
      tone: 'info',
      title: '샘플 PDF 준비 중',
      message: '백엔드를 먼저 깨운 뒤 샘플 PDF를 내려받아 분석합니다. 첫 요청은 30초 이상 걸릴 수 있습니다.',
    });
    try {
      attachTargetRef.current = null;
      try {
        const health = await fetchWithTimeout(
          `${API_BASE}/health`,
          { signal: controller.signal },
          SAMPLE_HEALTH_TIMEOUT_MS,
          '백엔드 상태 확인이 오래 걸리고 있습니다.',
        );
        if (!health.ok) await throwApiResponseError(health, '백엔드 상태를 확인하지 못했습니다.');
        if (controller.signal.aborted) return;
        setUploadNotice({
          tone: 'info',
          title: '샘플 PDF 내려받는 중',
          message: '백엔드가 응답했습니다. 샘플 파일을 받은 뒤 자동으로 본문을 추출합니다.',
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        const apiError = classifyApiException(error, '백엔드 상태를 확인하지 못했습니다.');
        setUploadNotice({
          tone: 'warning',
          title: `${apiError.title} - 샘플 PDF 재시도 중`,
          message: `${apiError.message} 샘플 파일 요청을 한 번 더 시도합니다.`,
        });
      }
      setSamplePhase('downloading');
      const res = await fetchWithTimeout(
        `${API_BASE}/papers/sample-pdf`,
        { signal: controller.signal },
        SAMPLE_DOWNLOAD_TIMEOUT_MS,
        '샘플 PDF 다운로드가 오래 걸려 중단했습니다.',
      );
      if (!res.ok) {
        await throwApiResponseError(res, '샘플 PDF를 불러오지 못했습니다.');
      }
      const blob = await res.blob();
      const filename = sampleFilenameFromResponse(res);
      setSamplePhase('extracting');
      await handleFile(new File([blob], filename, { type: 'application/pdf', lastModified: 0 }), {
        signal: controller.signal,
        sourceKeyOverride: 'sample:paperlens',
        onPhase: (phase) => {
          if (phase === 'creating') setSamplePhase('creating');
          else if (phase === 'extracting' || phase === 'metadata') setSamplePhase('extracting');
        },
      });
      if (!controller.signal.aborted) {
        setSamplePhase('creating');
      }
    } catch (error) {
      if (isAbortError(error)) {
        setUploadNotice({
          tone: 'info',
          title: '샘플 PDF 취소됨',
          message: '진행 중이던 샘플 PDF 처리를 중단했습니다.',
        });
        return;
      }
      setSampleRetryAvailable(true);
      const apiError = classifyApiException(error, '샘플 PDF를 불러오지 못했습니다. 직접 PDF 업로드를 사용해 주세요.');
      setUploadNotice({
        tone: 'error',
        title: apiError.title,
        message: apiError.message,
      });
    } finally {
      if (sampleAbortRef.current === controller) sampleAbortRef.current = null;
      setSampleLoading(false);
      setSamplePhase('idle');
    }
  }

  function cancelSamplePdf() {
    sampleAbortRef.current?.abort();
  }

  async function registerByDoi() {
    const query = doiInput.trim();
    if (!query) return;
    setUploadNotice(null);
    setDoiLoading(true);
    setUploadPhase('metadata');
    try {
      if (isLocalFileReference(query)) {
        setUploadNotice({
          tone: 'warning',
          title: 'PDF 파일 업로드가 필요합니다',
          message:
            '내 컴퓨터의 PDF는 URL 입력칸이 아니라 PDF 업로드 버튼으로 등록해 주세요. URL 등록은 공용 인터넷에서 바로 열리는 PDF 주소만 지원합니다.',
        });
        return;
      }

      if (isPdfUrl(query)) {
        const sourceKey = `url:${query}`;
        const duplicate = Object.values(libraryRef.current).find((p) => p.sourceKey === sourceKey);
        if (duplicate) {
          setActiveId(duplicate.id);
          setMobilePanel('paper');
          setUploadOpen(false);
          setUploadNotice({
            tone: 'info',
            title: '이미 등록된 PDF URL',
            message: '새 노트를 만들지 않고 기존 리뷰 노트를 열었습니다.',
          });
          setDoiInput('');
          return;
        }

        const uploadPaperId = uid();
        const form = new FormData();
        form.append('url', query);
        form.append('paper_id', uploadPaperId);
        setUploadPhase('extracting');
        const pdfRes = await fetch(`${API_BASE}/papers/extract-url`, {
          method: 'POST',
          headers: authHeaders,
          body: form,
        });
        if (!pdfRes.ok) {
          const apiError = await apiErrorFromResponse(pdfRes, 'PDF URL을 처리하지 못했습니다.');
          setUploadNotice({
            tone: pdfRes.status >= 500 ? 'error' : 'warning',
            title: apiError.title,
            message: apiError.message,
          });
          return;
        }
        const data: {
          filename: string;
          text: string;
          title?: string;
          authors?: string;
          link?: string;
          doi?: string;
          sections?: DetectedSection[];
          figure_images?: FigureImageRef[];
          suggested_tags?: string[];
          metadata_source?: string;
          metadata_confidence?: string;
          metadata_warnings?: string[];
          extraction_quality?: ExtractionQualityResponse;
          pdf_url?: string;
          pdf_filename?: string;
          page_count?: number;
          scanned?: boolean;
          notice?: string | null;
        } = await pdfRes.json();
        const suggestedTags = data.suggested_tags ?? [];
        const unknownTitle = !data.title || data.title === '(제목 없음)';
        const unknownAuthors = !data.authors || data.authors === '저자 미상';
        const metadataWarnings = data.notice
          ? [...(data.metadata_warnings ?? []), data.notice]
          : (data.metadata_warnings ?? []);
        const extractionQuality = normalizeExtractionQuality(data.extraction_quality);
        setUploadPhase('creating');
        registerPaper({
          title: unknownTitle ? data.filename.replace(/\.pdf$/i, '') : (data.title ?? ''),
          authors: unknownAuthors ? '' : (data.authors ?? ''),
          link: data.link || query,
          doi: data.doi || '',
          sourceKey,
          suggestedTags,
          metadataSource: data.metadata_source,
          metadataConfidence: data.metadata_confidence,
          metadataWarnings,
          extractionQuality,
          pdfUrl: data.pdf_url ? resolveApiUrl(data.pdf_url) : '',
          pdfFilename: data.pdf_filename || data.filename || '',
          pageCount: data.page_count,
          sections: data.sections ?? [],
          figureImages: data.figure_images ?? [],
          text: data.text || '',
        }, suggestedTags, uploadPaperId);
        setUploadNotice({
          tone: data.notice ? 'warning' : 'success',
          title: data.notice ? 'PDF 원문 확인 필요' : 'PDF URL 등록 완료',
          message: withExtractionQualityMessage(
            data.notice || 'URL에서 PDF를 내려받아 원문과 메타정보를 반영했습니다.',
            extractionQuality,
          ),
        });
        setDoiInput('');
        return;
      }

      const doiLike = isLikelyDoi(query);
      const urlLike = /^https?:\/\//i.test(query);
      if (urlLike && !doiLike) {
        setUploadNotice({
          tone: 'warning',
          title: 'PDF 원문 URL이 필요합니다',
          message: '웹페이지 주소는 원문을 안정적으로 가져올 수 없습니다. 내 컴퓨터의 PDF는 업로드 버튼으로 등록하고, URL 등록에는 PDF로 바로 열리는 공용 인터넷 주소를 입력해 주세요.',
        });
        return;
      }

      const res = await fetch(`${API_BASE}/papers/metadata?doi=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('metadata failed');
      const data: {
        title: string;
        authors: string;
        link: string;
        doi?: string;
        suggested_tags?: string[];
      } = await res.json();
      const suggestedTags = data.suggested_tags ?? [];
      setUploadPhase('creating');
      registerPaper({
        title: data.title === '(제목 없음)' ? '' : data.title,
        authors: data.authors === '저자 미상' ? '' : data.authors,
        link: data.link,
        doi: data.doi || '',
        sourceKey: `doi:${query}`,
        suggestedTags,
        metadataSource: 'crossref',
        metadataConfidence: 'high',
        metadataWarnings: [],
        text: '[DOI 등록] CrossRef에서 메타정보를 가져왔습니다. 본문 가져오기는 후속 작업이며, 지금도 리뷰 노트는 직접 작성할 수 있습니다.',
      }, suggestedTags);
      setUploadNotice({
        tone: 'info',
        title: '메타정보 등록 완료',
        message: 'DOI는 원문 PDF를 직접 포함하지 않습니다. 원문 패널에서 PDF 파일 또는 PDF URL을 연결하면 본문과 PDF 원본 보기를 사용할 수 있습니다.',
      });
      setDoiInput('');
    } catch (error) {
      // 비DOI 입력·미연동·조회 실패 시에도 등록 흐름이 끊기지 않게 폴백
      const doiLike = isLikelyDoi(query);
      const apiError = classifyApiException(error);
      setUploadPhase('creating');
      registerPaper({
        title: query,
        authors: '',
        link: query,
        doi: doiLike ? query.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '',
        sourceKey: doiLike ? `doi:${query}` : `manual:${query}`,
        suggestedTags: [],
        metadataSource: doiLike ? 'doi' : 'manual',
        metadataConfidence: 'none',
        metadataWarnings: [],
        text: doiLike
          ? '[DOI 등록] 메타정보를 가져오지 못했습니다. 제목·저자를 직접 입력하고, 원문 패널에서 PDF 파일 또는 PDF URL을 연결할 수 있습니다.'
          : '[DOI 등록] 메타정보를 가져오지 못했습니다. 제목·저자를 직접 입력하고 리뷰 노트를 작성할 수 있습니다.',
      });
      setUploadNotice({
        tone: 'warning',
        title: doiLike ? 'DOI 등록 완료' : apiError.kind === 'unknown' ? '메타정보 조회 실패' : apiError.title,
        message: doiLike
          ? `CrossRef에서 메타정보를 찾지 못했습니다. DOI는 노트에 남겼고, 원문은 PDF 파일 또는 PDF URL로 연결할 수 있습니다.${apiError.kind === 'unknown' ? '' : ` (${apiError.message})`}`
          : `${apiError.kind === 'unknown' ? 'DOI를 찾지 못했습니다.' : apiError.message} PDF 원문 URL 또는 PDF 파일 업로드를 사용해 주세요.`,
      });
      setDoiInput('');
    } finally {
      setDoiLoading(false);
      setUploadPhase('idle');
    }
  }

  // ── 본문 드래그 → 하이라이트 / 용어 추가 (FS-02, FS-03) ──
  // 컨테이너(pre-wrap, DOM 텍스트 == paper.text)에서 (node,offset) 지점의 문자 오프셋을 구한다.
  function offsetWithin(container: HTMLElement, node: Node, offset: number): number {
    const r = document.createRange();
    r.setStart(container, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  }

  function resolveSelectionRange(text: string, start: number, end: number) {
    const source = paper?.text ?? '';
    if (!source) return null;
    if (start >= 0 && end > start && end <= source.length) return { start, end };
    const exact = source.indexOf(text);
    if (exact >= 0) return { start: exact, end: exact + text.length };
    return null;
  }

  function onTextMouseUp(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
      setSelection(null);
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    const container = bodyRef.current;
    if (!sel || sel.isCollapsed || text.trim().length === 0 || sel.rangeCount === 0 || !container) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    try {
      const a = offsetWithin(container, range.startContainer, range.startOffset);
      const b = offsetWithin(container, range.endContainer, range.endOffset);
      const resolved = resolveSelectionRange(text, Math.min(a, b), Math.max(a, b));
      if (!resolved) {
        setSelection(null);
        setSyncNotice({
          tone: 'warning',
          title: '하이라이트 위치 확인 필요',
          message: '브라우저 번역으로 본문 위치가 바뀌었습니다. 원문 보기에서 다시 선택해 주세요.',
        });
        return;
      }
      setSelection({ text, start: resolved.start, end: resolved.end, x: e.clientX, y: e.clientY });
    } catch {
      setSelection(null);
      setSyncNotice({
        tone: 'warning',
        title: '하이라이트 위치 확인 필요',
        message: '브라우저 번역으로 선택 위치를 계산하지 못했습니다. 원문 보기에서 다시 선택해 주세요.',
      });
    }
  }

  function addHighlight() {
    if (!selection) return;
    const resolved = resolveSelectionRange(selection.text, selection.start, selection.end);
    if (!resolved) {
      setSelection(null);
      setSyncNotice({
        tone: 'warning',
        title: '하이라이트 위치 확인 필요',
        message: '선택한 문장을 원문 위치와 연결하지 못했습니다. 원문 보기에서 다시 선택해 주세요.',
      });
      window.getSelection()?.removeAllRanges();
      return;
    }
    setNote((n) => ({
      ...n,
      highlights: [
        ...n.highlights,
        {
          id: uid(),
          text: selection.text,
          color: highlightColor,
          start: resolved.start,
          end: resolved.end,
          // 라벨 기반 인용 목적 기본값 제안 (§8-4). 사용자가 select에서 바꾸면 확정으로 전환.
          ...citationSuggestionFields(highlightColor),
        },
      ],
    }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function addPdfHighlight({
    color,
    page,
    rects,
    text,
  }: {
    color: HighlightColor;
    page: number;
    rects: { x: number; y: number; width: number; height: number }[];
    text: string;
  }) {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const normalizedRects = rects
      .map((rect) => ({
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!normalizedText || normalizedRects.length === 0) return;
    setNote((n) => ({
      ...n,
      highlights: [
        ...n.highlights,
        {
          id: uid(),
          text: normalizedText,
          color,
          ...citationSuggestionFields(color),
          pdf: {
            page,
            rects: normalizedRects,
          },
        },
      ],
    }));
    window.getSelection()?.removeAllRanges();
  }

  function addTerm() {
    if (!selection) return;
    setNote((n) => ({
      ...n,
      terms: [
        ...n.terms,
        { id: uid(), term: selection.text, explanation: '', addedByUser: true, aiExplained: false },
      ],
    }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function addTermText(text: string) {
    const term = text.replace(/\s+/g, ' ').trim();
    if (!term) return;
    setNote((n) => ({
      ...n,
      terms: [
        ...n.terms,
        { id: uid(), term, explanation: '', addedByUser: true, aiExplained: false },
      ],
    }));
    window.getSelection()?.removeAllRanges();
  }

  // ── 시그널 스캐너 (FR-24, M4: 한계 시그널 + 키워드 후보) ──
  // 결과는 저장하지 않는 휘발성 안내. T4(비판적 검토)에서 기본 켜지고 그 외에는 수동.
  const [signalScanEnabled, setSignalScanEnabled] = useState(false);
  useEffect(() => {
    setSignalScanEnabled(note.templateId === 't4_critical');
  }, [paper?.id, note.templateId]);

  // 추출 품질이 낮으면 문장 경계·오프셋을 신뢰할 수 없어 스캐너를 막는다 (FS-07 예외).
  const signalScanBlocked =
    paper?.extractionQuality?.status === 'poor' || paper?.extractionQuality?.status === 'failed';

  const signalMatches = React.useMemo(
    () =>
      signalScanEnabled && !signalScanBlocked && paper?.text
        ? scanSignals(paper.text, paper.sections ?? [])
        : [],
    [signalScanEnabled, signalScanBlocked, paper?.text, paper?.sections],
  );
  // 시그널 타입별 건수 (스캐너 안내 뱃지용).
  const signalCounts = React.useMemo(() => {
    const counts = { limitation: 0, perspective: 0, critique: 0 };
    for (const match of signalMatches) counts[match.type] += 1;
    return counts;
  }, [signalMatches]);

  const noteTerms = note.terms;
  const keywordCandidates = React.useMemo(
    () =>
      signalScanEnabled && !signalScanBlocked && paper?.text
        ? buildKeywordCandidates(
            paper.text,
            paper.sections ?? [],
            noteTerms.map((t) => t.term),
          )
        : [],
    [signalScanEnabled, signalScanBlocked, paper?.text, paper?.sections, noteTerms],
  );

  // 시그널 문장을 의미 라벨 하이라이트로 승격 (§8-5: 승격분만 저장).
  // 관점→주장(yellow), 한계·비판→한계/비판(pink).
  function promoteSignal(signal: SignalMatch) {
    const text = paper?.text;
    if (!text) return;
    const sliced = text.slice(signal.start, signal.end);
    if (!sliced.trim()) return;
    const color: HighlightColor = SIGNAL_PROMOTE_COLOR[signal.type];
    setNote((n) => ({
      ...n,
      highlights: [
        ...n.highlights,
        {
          id: uid(),
          text: sliced,
          color,
          start: signal.start,
          end: signal.end,
          ...citationSuggestionFields(color),
        },
      ],
    }));
  }

  // ── 그림/표 네비게이터 (FR-27, M5: 캡션 목록·점프·본문 교차참조·캡션 메모) ──
  const figureIndex = React.useMemo(
    () => buildFigureIndex(paper?.text ?? '', paper?.figureImages ?? []),
    [paper?.text, paper?.figureImages],
  );
  const figureMentionCounts = React.useMemo(() => mentionCounts(figureIndex), [figureIndex]);

  // 원문 스크롤 컨테이너에서 캡션 위치로 이동 (아웃라인 점프와 동일 방식)
  function jumpToTextOffset(offset: number) {
    if (bodyRef.current) scrollToTextOffset(bodyRef.current, offset);
  }
  function jumpToCaption(mention: FigureMentionLink) {
    jumpToTextOffset(mention.targetStart);
  }

  const bodyNodes = usePaperBodyNodes(
    paper,
    note,
    highlightFilter,
    signalMatches,
    promoteSignal,
    figureIndex.mentions,
    jumpToCaption,
    focusHighlightId,
  );

  function contextForTerm(term: string): string {
    if (!paper?.text) return '';
    const index = paper.text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
    if (index < 0) return paper.text.slice(0, 1200);
    return paper.text.slice(Math.max(0, index - 500), Math.min(paper.text.length, index + term.length + 700));
  }

  async function explainTerm(termId: string) {
    const target = note.terms.find((t) => t.id === termId);
    if (!target || !paper) return;
    setAiLoadingTermId(termId);
    try {
      const res = await fetch(`${API_BASE}/ai/term-explanation`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: target.term,
          paperTitle: paper.title,
          context: contextForTerm(target.term),
        }),
      });
      if (!res.ok) {
        let detail = 'AI 설명을 생성하지 못했습니다.';
        try {
          detail = ((await res.json()) as { detail?: string }).detail ?? detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as { explanation?: string };
      const explanation = data.explanation?.trim();
      if (!explanation) throw new Error('AI 설명이 비어 있습니다.');
      setNote((n) => ({
        ...n,
        terms: n.terms.map((t) =>
          t.id === termId ? { ...t, explanation, aiExplained: true } : t,
        ),
      }));
      setSyncNotice({
        tone: 'success',
        title: 'AI 설명 초안 생성',
        message: '생성된 설명을 검토하고 필요하면 직접 수정하세요.',
      });
    } catch (error) {
      setSyncNotice({
        tone: 'warning',
        title: 'AI 설명 실패',
        message: error instanceof Error ? error.message : 'AI 설명을 생성하지 못했습니다.',
      });
    } finally {
      setAiLoadingTermId(null);
    }
  }

  const updateNote = <K extends keyof ReviewNote>(key: K, value: ReviewNote[K]) =>
    setNote((n) => ({ ...n, [key]: value }));

  const checklist = buildChecklist(note);
  const doneCount = countDone(checklist);

  // ── 지식베이스 검색·태그 필터 (FR-09) ──
  const allTags = collectTags(notes);
  const visiblePapers = filterPapers(library, notes, search, activeTags);
  const toggleTagFilter = (tag: string) =>
    setActiveTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));

  // ── 내보내기 (FR-11) ──
  function exportMarkdown(options?: Partial<ExportOptions>) {
    if (!paper) return;
    const blob = new Blob([buildMarkdown(paper, note, options)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename(paper.title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf(options?: Partial<ExportOptions>) {
    if (!paper) return;
    const w = window.open('', '_blank');
    if (!w) {
      window.alert('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.');
      return;
    }
    w.document.write(buildPrintHtml(paper, note, options));
    w.document.close();
  }

  return {
    // 상태/파생 데이터
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
    loaded,
    savedAt,
    restorePhase,
    restoreElapsedSeconds,
    online,
    pending,
    syncing,
    retryCountdown,
    syncNotice,
    aiEnabled,
    aiLoadingTermId,
    search,
    activeTags,
    allTags,
    visiblePapers,
    mobilePanel,
    sidebarCollapsed,
    setSidebarCollapsed,
    highlightColor,
    highlightFilter,
    selection,
    bodyNodes,
    checklist,
    doneCount,
    // refs
    fileInputRef,
    bodyRef,
    attachTargetRef,
    // setters
    setDoiInput,
    setUploadNotice,
    setUploadOpen,
    setSearch,
    setMobilePanel,
    setHighlightColor,
    setHighlightFilter,
    setSelection,
    setSyncNotice,
    // 액션
    setNote,
    setSectionSummaries,
    setTags,
    updatePaper,
    ocrPaper,
    ocrRunning,
    ocrAvailable,
    updateNote,
    registerPaper,
    openPaper,
    deletePaper,
    saveNow: flush,
    retryNow,
    handleFile,
    handleSamplePdf,
    cancelSamplePdf,
    registerByDoi,
    onTextMouseUp,
    addHighlight,
    addPdfHighlight,
    addTerm,
    addTermText,
    explainTerm,
    toggleTagFilter,
    exportMarkdown,
    exportPdf,
    signalScanEnabled,
    setSignalScanEnabled,
    signalScanBlocked,
    signalMatches,
    signalCounts,
    keywordCandidates,
    promoteSignal,
    figureCaptions: figureIndex.captions,
    figureMentionCounts,
    jumpToTextOffset,
    openAggregatedItem,
  };
}

// 워크스페이스 패널들이 Context로 공유하는 store 타입.
export type ReviewStore = ReturnType<typeof useReviewStore>;
