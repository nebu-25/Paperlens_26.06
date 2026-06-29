import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type WheelEvent } from 'react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/display/api';

type PdfViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type PageSize = {
  baseWidth: number;
  baseHeight: number;
  width: number;
  height: number;
};

const MIN_SCALE = 0.75;
const MAX_SCALE = 2;
const SCALE_STEP = 0.15;

interface PdfViewerProps {
  title: string;
  url: string;
  accessToken: string | null;
}

function errorMessage(status?: number) {
  if (status === 401) {
    return 'PDF 원본 미리보기를 열 수 없습니다. 로그인 세션을 새로고침한 뒤 다시 시도해 주세요.';
  }
  return 'PDF 원본 미리보기를 불러오지 못했습니다. 하이라이트 가능한 원문은 계속 사용할 수 있습니다.';
}

function clampScale(value: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(value.toFixed(2))));
}

export function PdfViewer({ title, url, accessToken }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<PdfViewerStatus>('idle');
  const [message, setMessage] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [panning, setPanning] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!url) {
      setDocument(null);
      setPageNumber(1);
      setPageCount(0);
      setPageSize(null);
      setStatus('idle');
      setMessage('');
      return;
    }

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;
    setStatus('loading');
    setMessage('백엔드에서 PDF 원본을 불러오고 있습니다.');
    setDocument(null);
    setPageNumber(1);
    setPageCount(0);
    setPageSize(null);

    (async () => {
      try {
        const res = await fetch(url, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
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
        loadingTask = pdfjs.getDocument({ data });
        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          void loadedDocument.cleanup();
          return;
        }
        setDocument(loadedDocument);
        setPageCount(loadedDocument.numPages);
        setStatus('ready');
        setMessage('');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage(errorMessage());
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
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas context is unavailable.');

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        setPageSize({
          baseWidth: Math.ceil(baseViewport.width),
          baseHeight: Math.ceil(baseViewport.height),
          width: Math.ceil(viewport.width),
          height: Math.ceil(viewport.height),
        });

        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          setStatus('error');
          setMessage(errorMessage());
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, scale]);

  const zoomBy = (delta: number) => {
    setScale((value) => clampScale(value + delta));
  };

  const fitWidth = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !pageSize?.baseWidth) return;
    const availableWidth = Math.max(240, scrollEl.clientWidth - 24);
    setScale(clampScale(availableWidth / pageSize.baseWidth));
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP);
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || status !== 'ready') return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
    };
    setPanning(true);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!panning) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
    const start = panStartRef.current;
    scrollEl.scrollLeft = start.scrollLeft - (event.clientX - start.x);
    scrollEl.scrollTop = start.scrollTop - (event.clientY - start.y);
  };

  const stopPanning = () => setPanning(false);

  const canGoPrevious = pageNumber > 1;
  const canGoNext = pageCount > 0 && pageNumber < pageCount;
  const scalePercent = `${Math.round(scale * 100)}%`;
  const pageStyle = pageSize
    ? { width: `${pageSize.width}px`, height: `${pageSize.height}px` }
    : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">PDF 원본 보기</h3>
          <div className="truncate text-xs text-muted">{title || '저장된 PDF'}</div>
        </div>
        <div className="flex items-center gap-1">
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
          status === 'ready' ? (panning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPanning}
        onMouseLeave={stopPanning}
      >
        {status === 'ready' ? (
          <div className="flex min-h-full justify-center">
            <div
              className="relative h-fit max-w-none bg-white shadow-sm"
              style={pageStyle}
              data-pdf-page={pageNumber}
              data-pdf-scale={scale}
            >
              <canvas
                ref={canvasRef}
                className="block h-full w-full"
                aria-label={`${title || '논문'} PDF ${pageNumber}페이지`}
              />
              <div
                className="pointer-events-none absolute inset-0"
                data-pdf-text-layer
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0"
                data-pdf-highlight-layer
                aria-hidden="true"
              />
            </div>
          </div>
        ) : (
          <div className="rounded border border-line bg-white p-3 text-xs leading-relaxed text-muted">
            {message || 'PDF 원본 미리보기를 준비하고 있습니다.'}
          </div>
        )}
      </div>
    </div>
  );
}
