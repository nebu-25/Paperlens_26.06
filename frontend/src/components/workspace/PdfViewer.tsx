import {
  ChevronLeft,
  ChevronRight,
  Hand,
  MousePointer2,
  RotateCcw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api';
import type { TextLayer } from 'pdfjs-dist/types/src/display/text_layer';
import { HIGHLIGHT_COLORS } from '../../constants';
import { isChunkLoadError } from '../../lib/chunkLoad';
import type { Highlight, HighlightColor } from '../../types';
import { bandIndexOf, mergeColumnBands, type XSpan } from './pdfHighlightColumns';
import { AddTermButton, HighlightButton, HighlightColorSwatches } from './HighlightSelectionControls';

type PdfViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type PageSize = {
  baseWidth: number;
  baseHeight: number;
  width: number;
  height: number;
};
type PdfPendingHighlight = {
  color: HighlightColor;
  page: number;
  rects: { x: number; y: number; width: number; height: number }[];
  text: string;
  x: number;
  y: number;
};
type PdfActiveHighlight = {
  id: string;
  color: HighlightColor;
  text: string;
  x: number;
  y: number;
};
type PdfInteractionMode = 'select' | 'pan';
type ClientRectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const MIN_SCALE = 0.75;
const MAX_SCALE = 5;
const SCALE_STEP = 0.25;
const WHEEL_SCALE_STEP = 0.1;
const MIN_HIGHLIGHT_RECT_SIZE = 1;

interface PdfViewerProps {
  title: string;
  url: string;
  accessToken: string | null;
  highlights: Highlight[];
  highlightColor: HighlightColor;
  onSelectHighlightColor: (color: HighlightColor) => void;
  onAddHighlight: (highlight: {
    color: HighlightColor;
    page: number;
    rects: { x: number; y: number; width: number; height: number }[];
    text: string;
  }) => void;
  onRemoveHighlight: (id: string) => void;
  onAddTerm: (text: string) => void;
}

const PDF_HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(250, 204, 21, 0.36)',
  green: 'rgba(52, 211, 153, 0.32)',
  blue: 'rgba(56, 189, 248, 0.32)',
  pink: 'rgba(251, 113, 133, 0.32)',
  orange: 'rgba(251, 146, 60, 0.32)',
  violet: 'rgba(167, 139, 250, 0.32)',
};

function errorMessage(status?: number, error?: unknown) {
  if (isChunkLoadError(error)) {
    return '새 배포 파일을 다시 받아야 PDF 원본 보기를 열 수 있습니다. 브라우저가 이전 파일을 캐시하고 있을 수 있으니 화면을 새로고침해 주세요.';
  }
  if (status === 401) {
    return 'PDF 원본 파일 권한을 확인하지 못했습니다. 먼저 페이지를 새로고침해 로그인 세션을 갱신해 주세요. 같은 오류가 계속되면 이 노트의 PDF 원본이 현재 계정에 연결되어 있지 않을 수 있으니 PDF를 다시 연결해 주세요.';
  }
  return 'PDF 원본 미리보기를 불러오지 못했습니다. 하이라이트 가능한 원문은 계속 사용할 수 있습니다.';
}

function clampScale(value: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(value.toFixed(2))));
}

function intersectRect(a: ClientRectLike, b: ClientRectLike) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function rectToPdfRect(rect: ClientRectLike, pageLayer: HTMLElement, scale: number) {
  const pageBounds = pageLayer.getBoundingClientRect();
  const clipped = intersectRect(rect, pageBounds);
  if (!clipped || clipped.width < MIN_HIGHLIGHT_RECT_SIZE || clipped.height < MIN_HIGHLIGHT_RECT_SIZE) return null;
  return {
    x: (clipped.left - pageBounds.left) / scale,
    y: (clipped.top - pageBounds.top) / scale,
    width: clipped.width / scale,
    height: clipped.height / scale,
  };
}

function isTextNode(node: Node | null): node is Text {
  return node?.nodeType === Node.TEXT_NODE;
}

function isForwardSelection(selection: Selection) {
  const { anchorNode, focusNode, anchorOffset, focusOffset } = selection;
  if (!anchorNode || !focusNode) return true;
  if (anchorNode === focusNode) return anchorOffset <= focusOffset;
  const position = anchorNode.compareDocumentPosition(focusNode);
  return Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING);
}

function rectForTextCharacter(node: Text, index: number) {
  if (index < 0 || index >= node.data.length) return null;
  const range = document.createRange();
  range.setStart(node, index);
  range.setEnd(node, index + 1);
  const rect = Array.from(range.getClientRects()).find(
    (candidate) =>
      candidate.width >= MIN_HIGHLIGHT_RECT_SIZE
      && candidate.height >= MIN_HIGHLIGHT_RECT_SIZE,
  );
  range.detach();
  return rect ?? null;
}

function rangeWithPointerEndCorrection(selection: Selection, event: MouseEvent) {
  const range = selection.getRangeAt(0).cloneRange();
  if (!isForwardSelection(selection) || !isTextNode(selection.focusNode)) return range;

  const focusNode = selection.focusNode;
  const focusOffset = selection.focusOffset;
  if (focusOffset >= focusNode.data.length) return range;

  const nextRect = rectForTextCharacter(focusNode, focusOffset);
  if (!nextRect) return range;

  const yTolerance = Math.max(3, nextRect.height * 0.25);
  const pointerOnLine = event.clientY >= nextRect.top - yTolerance
    && event.clientY <= nextRect.bottom + yTolerance;
  const pointerPastMidpoint = event.clientX >= nextRect.left + nextRect.width * 0.45;
  if (pointerOnLine && pointerPastMidpoint) {
    range.setEnd(focusNode, focusOffset + 1);
  }
  return range;
}

// 선택 끝점(anchor/focus) 글자의 x 위치.
function caretSpan(node: Node | null, offset: number): XSpan | null {
  if (!isTextNode(node)) return null;
  const range = document.createRange();
  const idx = Math.min(Math.max(offset, 0), node.data.length);
  range.setStart(node, idx);
  range.setEnd(node, idx);
  const rect = range.getBoundingClientRect();
  range.detach();
  return rect ? { left: rect.left, right: rect.right } : null;
}

// 드래그가 지난 컬럼 밴드 안의 rect·텍스트만 남긴다(다단 논문의 컬럼 번짐 방지).
function selectionWithinDraggedColumns(
  range: Range,
  anchor: XSpan | null,
  focus: XSpan | null,
): { rects: DOMRect[]; text: string } {
  const allRects = Array.from(range.getClientRects()).filter(
    (r) => r.width >= MIN_HIGHLIGHT_RECT_SIZE && r.height >= MIN_HIGHLIGHT_RECT_SIZE,
  );
  const bands = mergeColumnBands(allRects);
  // 단일 컬럼이거나 끝점 판정 불가 → 원본 유지(안전)
  if (bands.length <= 1 || !anchor || !focus) return { rects: allRects, text: range.toString() };

  const a = bandIndexOf(bands, anchor);
  const f = bandIndexOf(bands, focus);
  if (a < 0 || f < 0) return { rects: allRects, text: range.toString() };
  const lo = Math.min(a, f);
  const hi = Math.max(a, f);
  const inKept = (span: XSpan) => {
    const idx = bandIndexOf(bands, span);
    return idx >= lo && idx <= hi;
  };

  const rects = allRects.filter(inKept);
  // 텍스트도 같은 밴드의 노드만 이어붙여 오른쪽 컬럼 단어 혼입을 막는다.
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue;
    const piece = range.cloneRange();
    piece.setStart(n, n === range.startContainer ? range.startOffset : 0);
    piece.setEnd(n, n === range.endContainer ? range.endOffset : (n as Text).data.length);
    const rect = piece.getBoundingClientRect();
    const included = rect ? inKept({ left: rect.left, right: rect.right }) : false;
    const pieceText = piece.toString();
    piece.detach();
    if (included) parts.push(pieceText);
  }
  return { rects, text: parts.join('').trim() || range.toString() };
}

export function PdfViewer({
  title,
  url,
  accessToken,
  highlights,
  highlightColor,
  onSelectHighlightColor,
  onAddHighlight,
  onRemoveHighlight,
  onAddTerm,
}: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageLayerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const panningRef = useRef(false);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [status, setStatus] = useState<PdfViewerStatus>('idle');
  const [message, setMessage] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [interactionMode, setInteractionMode] = useState<PdfInteractionMode>('select');
  const [panning, setPanning] = useState(false);
  const [pendingHighlight, setPendingHighlight] = useState<PdfPendingHighlight | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<PdfActiveHighlight | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!url) {
      setDocument(null);
      setPage(null);
      setPageNumber(1);
      setPageCount(0);
      setPageSize(null);
      setPendingHighlight(null);
      setActiveHighlight(null);
      setStatus('idle');
      setMessage('');
      return;
    }

    if (!accessToken) {
      setDocument(null);
      setPage(null);
      setPageNumber(1);
      setPageCount(0);
      setPageSize(null);
      setPendingHighlight(null);
      setActiveHighlight(null);
      setStatus('error');
      setMessage('로그인 세션을 확인한 뒤 PDF 원본을 불러옵니다. 잠시 후에도 열리지 않으면 페이지를 새로고침해 주세요.');
      return;
    }

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;
    setStatus('loading');
    setMessage('백엔드에서 PDF 원본을 불러오고 있습니다.');
    setDocument(null);
    setPage(null);
    setPageNumber(1);
    setPageCount(0);
    setPageSize(null);
    setPendingHighlight(null);
    setActiveHighlight(null);

    (async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setStatus('error');
            setMessage(errorMessage(res.status));
          }
          return;
        }
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
        loadingTask = pdfjs.getDocument({ data, useWasm: false });
        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          void loadedDocument.cleanup();
          return;
        }
        setDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setStatus('ready');
        setMessage('');
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setMessage(errorMessage(undefined, error));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadedDocument) {
        void loadedDocument.cleanup();
      } else {
        void loadingTask?.destroy();
      }
    };
  }, [accessToken, reloadKey, url]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;

    (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;
        setPage(page);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context is unavailable.');

        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(width * outputScale);
        canvas.height = Math.ceil(height * outputScale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        setPageSize({
          baseWidth: Math.ceil(baseViewport.width),
          baseHeight: Math.ceil(baseViewport.height),
          width,
          height,
        });

        renderTask = page.render({
          canvas,
          canvasContext: context,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          setStatus('error');
          setMessage(errorMessage(undefined, error));
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, scale]);

  useEffect(() => {
    if (!page || !textLayerRef.current) return;

    let cancelled = false;
    let textLayer: TextLayer | null = null;
    const container = textLayerRef.current;
    container.replaceChildren();

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const viewport = page.getViewport({ scale });
        const textContent = await page.getTextContent();
        if (cancelled) return;
        textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container,
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        if (!cancelled) {
          container.replaceChildren();
          if (isChunkLoadError(error)) {
            setStatus('error');
            setMessage(errorMessage(undefined, error));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      textLayer?.cancel();
      container.replaceChildren();
    };
  }, [page, scale]);

  useEffect(() => {
    setPendingHighlight(null);
    setActiveHighlight(null);
    window.getSelection()?.removeAllRanges();
  }, [pageNumber, url]);

  const zoomBy = (delta: number) => {
    setScale((value) => clampScale(value + delta));
  };

  const clearPendingHighlight = () => {
    setPendingHighlight(null);
    window.getSelection()?.removeAllRanges();
  };

  const closeActiveHighlight = () => {
    setActiveHighlight(null);
  };

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? -WHEEL_SCALE_STEP : WHEEL_SCALE_STEP);
    };

    scrollEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, []);

  const fitWidth = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !pageSize?.baseWidth) return;
    const availableWidth = Math.max(240, scrollEl.clientWidth - 24);
    setScale(clampScale(availableWidth / pageSize.baseWidth));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || status !== 'ready') return;
    const pageLayer = pageLayerRef.current;
    const isOnPage = Boolean(pageLayer && pageLayer.contains(event.target as Node));
    const canPan =
      interactionMode === 'pan'
      || event.altKey
      || event.button === 1
      || !isOnPage;
    if (!canPan) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
    scrollEl.setPointerCapture(event.pointerId);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
    };
    panningRef.current = true;
    setPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!panningRef.current) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
    const start = panStartRef.current;
    scrollEl.scrollLeft = start.scrollLeft - (event.clientX - start.x);
    scrollEl.scrollTop = start.scrollTop - (event.clientY - start.y);
  };

  const stopPanning = (event?: PointerEvent<HTMLDivElement>) => {
    if (event && scrollRef.current?.hasPointerCapture(event.pointerId)) {
      scrollRef.current.releasePointerCapture(event.pointerId);
    }
    panningRef.current = false;
    setPanning(false);
  };

  const handleTextMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (panningRef.current || status !== 'ready' || interactionMode !== 'select') return;
    if (!(event.target as HTMLElement).closest('[data-pdf-text-layer]')) return;
    const selection = window.getSelection();
    const pageLayer = pageLayerRef.current;
    const textLayer = textLayerRef.current;
    if (!selection || selection.isCollapsed || !pageLayer || !textLayer) return;

    const range = rangeWithPointerEndCorrection(selection, event);
    const selectedText = range.toString();
    if (!selectedText.trim()) {
      range.detach();
      return;
    }

    if (!textLayer.contains(range.commonAncestorContainer)) {
      range.detach();
      return;
    }

    const { rects: columnRects, text: columnText } = selectionWithinDraggedColumns(
      range,
      caretSpan(selection.anchorNode, selection.anchorOffset),
      caretSpan(selection.focusNode, selection.focusOffset),
    );
    const rects = columnRects
      .map((rect) => rectToPdfRect(rect, pageLayer, scale))
      .filter((rect): rect is PdfPendingHighlight['rects'][number] => Boolean(rect));
    if (rects.length === 0) {
      range.detach();
      return;
    }
    setPendingHighlight({
      color: highlightColor,
      page: pageNumber,
      rects,
      text: columnText || selectedText,
      x: event.clientX,
      y: event.clientY,
    });
    setActiveHighlight(null);
    range.detach();
  };

  const applyPendingHighlight = () => {
    if (!pendingHighlight) return;
    onAddHighlight({
      color: pendingHighlight.color,
      page: pendingHighlight.page,
      rects: pendingHighlight.rects,
      text: pendingHighlight.text,
    });
    clearPendingHighlight();
  };

  const selectPendingColor = (color: HighlightColor) => {
    onSelectHighlightColor(color);
    setPendingHighlight((current) => (current ? { ...current, color } : current));
  };

  const addPendingTerm = () => {
    if (!pendingHighlight) return;
    onAddTerm(pendingHighlight.text);
    clearPendingHighlight();
  };

  const openAppliedHighlight = (highlight: Highlight, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPendingHighlight(null);
    window.getSelection()?.removeAllRanges();
    setActiveHighlight({
      id: highlight.id,
      color: highlight.color ?? 'yellow',
      text: highlight.text,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const removeActiveHighlight = () => {
    if (!activeHighlight) return;
    onRemoveHighlight(activeHighlight.id);
    setActiveHighlight(null);
  };

  const canGoPrevious = pageNumber > 1;
  const canGoNext = pageCount > 0 && pageNumber < pageCount;
  const scalePercent = `${Math.round(scale * 100)}%`;
  const isPanMode = interactionMode === 'pan';
  const pageStyle = pageSize
    ? {
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
        aspectRatio: `${pageSize.baseWidth} / ${pageSize.baseHeight}`,
      }
    : undefined;
  const pageHighlights = highlights.filter((highlight) => highlight.pdf?.page === pageNumber);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">PDF 원본 보기</h3>
          <div className="truncate text-xs text-muted">{title || '저장된 PDF'}</div>
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 inline-flex rounded border border-line bg-white p-1" aria-label="PDF 조작 모드">
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded ${
                interactionMode === 'select' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
              }`}
              aria-label="텍스트 선택 모드"
              title="텍스트 선택 모드"
              aria-pressed={interactionMode === 'select'}
              onClick={() => setInteractionMode('select')}
            >
              <MousePointer2 size={14} />
            </button>
            <button
              type="button"
              className={`inline-flex h-7 w-7 items-center justify-center rounded ${
                interactionMode === 'pan' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
              }`}
              aria-label="화면 이동 모드"
              title="화면 이동 모드"
              aria-pressed={interactionMode === 'pan'}
              onClick={() => {
                clearPendingHighlight();
                setInteractionMode('pan');
              }}
            >
              <Hand size={14} />
            </button>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="이전 페이지"
            title="이전 페이지"
            disabled={!canGoPrevious}
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[5.5rem] text-center text-xs text-muted">
            {pageCount ? `${pageNumber} / ${pageCount}` : '- / -'}
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="다음 페이지"
            title="다음 페이지"
            disabled={!canGoNext}
            onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="축소"
            title="축소"
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomBy(-SCALE_STEP)}
          >
            <ZoomOut size={15} />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs text-muted">{scalePercent}</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="확대"
            title="확대"
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomBy(SCALE_STEP)}
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded border border-line px-2 text-xs font-medium text-muted hover:border-action hover:text-action disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!pageSize}
            onClick={fitWidth}
          >
            폭 맞춤
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-line text-muted hover:border-action hover:text-action"
            aria-label="PDF 다시 불러오기"
            title="PDF 다시 불러오기"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={`h-[calc(100vh-21rem)] min-h-[560px] overflow-auto rounded border border-line bg-paper p-3 ${
          status === 'ready' && (isPanMode || panning) ? (panning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''
        }`}
        title="텍스트 선택 모드: 드래그로 선택, 이동 모드: 드래그로 화면 이동"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
        onMouseUp={handleTextMouseUp}
      >
        {status === 'ready' ? (
          <div className="min-h-full w-max min-w-full">
            <div
              ref={pageLayerRef}
              className="relative mx-auto h-fit max-w-none bg-white shadow-sm"
              style={pageStyle}
              data-pdf-page={pageNumber}
              data-pdf-scale={scale}
            >
              <canvas
                ref={canvasRef}
                className="block max-w-none"
                style={pageStyle}
                aria-label={`${title || '논문'} PDF ${pageNumber}페이지`}
              />
              <div
                ref={textLayerRef}
                className={`pdf-text-layer absolute inset-0 ${isPanMode ? 'pdf-text-layer--pan' : ''}`}
                data-pdf-text-layer
              />
              <div
                className="pointer-events-none absolute inset-0"
                data-pdf-highlight-layer
              >
                {pendingHighlight?.rects.map((rect, index) => (
                  <div
                    key={`pdf-selection-preview-${index}`}
                    className="absolute rounded-[1px] outline outline-1 outline-action/40"
                    style={{
                      left: `${rect.x * scale}px`,
                      top: `${rect.y * scale}px`,
                      width: `${rect.width * scale}px`,
                      height: `${rect.height * scale}px`,
                      backgroundColor:
                        PDF_HIGHLIGHT_COLORS[pendingHighlight?.color ?? highlightColor] ?? PDF_HIGHLIGHT_COLORS.yellow,
                    }}
                  />
                ))}
                {pageHighlights.map((highlight) =>
                  highlight.pdf?.rects.map((rect, index) => (
                    <div
                      key={`${highlight.id}-${index}`}
                      className="pointer-events-auto absolute cursor-pointer rounded-[1px] outline-offset-1 hover:outline hover:outline-1 hover:outline-action"
                      style={{
                        left: `${rect.x * scale}px`,
                        top: `${rect.y * scale}px`,
                        width: `${rect.width * scale}px`,
                        height: `${rect.height * scale}px`,
                        backgroundColor:
                          PDF_HIGHLIGHT_COLORS[highlight.color ?? 'yellow'] ?? PDF_HIGHLIGHT_COLORS.yellow,
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => openAppliedHighlight(highlight, event)}
                    />
                  )),
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded border border-line bg-white p-3 text-xs leading-relaxed text-muted">
            {message || 'PDF 원본 미리보기를 준비하고 있습니다.'}
          </div>
        )}
      </div>
      {pendingHighlight && (
        <div
          className="fixed z-50 max-w-[min(92vw,28rem)] rounded border border-line bg-white p-2 shadow-lg"
          style={{
            left: Math.max(8, Math.min(pendingHighlight.x, window.innerWidth - 448)),
            top: Math.max(8, Math.min(pendingHighlight.y + 12, window.innerHeight - 128)),
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink">PDF 하이라이트</span>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink"
              aria-label="PDF 하이라이트 적용 취소"
              title="PDF 하이라이트 적용 취소"
              onClick={clearPendingHighlight}
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <HighlightColorSwatches selected={pendingHighlight.color} onSelect={selectPendingColor} />
            <HighlightButton onClick={applyPendingHighlight} />
            <AddTermButton onClick={addPendingTerm} />
          </div>
        </div>
      )}
      {activeHighlight && (
        <div
          className="fixed z-50 w-[min(92vw,20rem)] rounded border border-line bg-white p-2 shadow-lg"
          style={{
            left: Math.max(8, Math.min(activeHighlight.x, window.innerWidth - 320)),
            top: Math.max(8, Math.min(activeHighlight.y + 12, window.innerHeight - 128)),
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-ink">적용된 PDF 하이라이트</span>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink"
              aria-label="적용된 PDF 하이라이트 메뉴 닫기"
              title="닫기"
              onClick={closeActiveHighlight}
            >
              <X size={14} />
            </button>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted">{activeHighlight.text}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-paper px-2 py-1 text-[11px] font-medium text-muted">
              <span
                className={`size-3 rounded-full ${
                  HIGHLIGHT_COLORS.find((color) => color.value === activeHighlight.color)?.swatchClass
                  ?? 'bg-yellow-300'
                }`}
                aria-hidden="true"
              />
              {HIGHLIGHT_COLORS.find((color) => color.value === activeHighlight.color)?.label ?? '주장'}
            </span>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded border border-line px-2 text-[11px] font-semibold text-muted hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              onClick={removeActiveHighlight}
            >
              <Trash2 size={13} />
              하이라이트 해제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
