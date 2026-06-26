// PaperLens 핵심 상태/영속화/액션 훅. App 컴포넌트의 모든 비-뷰 로직을 담는다.
// 논문 라이브러리·노트 상태, 서버/로컬 동기화, 업로드·등록·하이라이트·내보내기 액션을 제공한다.
import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, resolveApiUrl } from '../constants';
import { buildMarkdown, buildPrintHtml, safeFilename } from '../lib/export';
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
import type {
  AppNotice,
  DetectedSection,
  HighlightColor,
  Paper,
  ReviewNote,
  SamplePhase,
  SectionSummary,
  UploadPhase,
} from '../types';
import { usePaperBodyNodes } from './usePaperBodyNodes';
import { useReviewPersistence } from './useReviewPersistence';

export function useReviewStore({
  accessToken,
  authReady,
  authEnabled,
}: {
  accessToken: string | null;
  authReady: boolean;
  authEnabled: boolean;
}) {
  // 논문별로 보관: library[id] = 논문, notes[id] = 그 논문의 리뷰 노트
  const [library, setLibrary] = useState<Record<string, Paper>>({});
  const [notes, setNotes] = useState<Record<string, ReviewNote>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doiInput, setDoiInput] = useState('');
  const [uploading, setUploading] = useState(false);
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

  const paper = activeId ? library[activeId] ?? null : null;
  const note = (activeId ? notes[activeId] : undefined) ?? EMPTY_NOTE;

  const {
    savedAt,
    setSavedAt,
    online,
    pending,
    syncNotice,
    setSyncNotice,
    libraryRef,
    notesRef,
    activeIdRef,
    markDirty,
    forgetDirty,
    queueDelete,
    flush,
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
    });

  const authHeaders: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  async function readErrorDetail(res: Response, fallback: string): Promise<string> {
    try {
      return ((await res.json()) as { detail?: string }).detail ?? fallback;
    } catch {
      return fallback;
    }
  }

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

  // 활성 논문의 메타정보(제목/저자/링크) 직접 편집 — 자동 추출 실패 시 보완
  function updatePaper(patch: Partial<Omit<Paper, 'id'>>) {
    if (!activeId) return;
    markDirty(activeId);
    setLibrary((lib) => (lib[activeId] ? { ...lib, [activeId]: { ...lib[activeId], ...patch } } : lib));
  }

  // ── 논문 등록 (#2: 논문별로 누적, 덮어쓰지 않음) ──
  function registerPaper(next: Omit<Paper, 'id'>, initialTags: string[] = [], id = uid()) {
    setLibrary((l) => ({ ...l, [id]: { ...next, id } }));
    // 논문마다 자체 섹션 배열을 갖도록 새 노트를 생성한다.
    // 자동 감지된 섹션이 있으면 그것으로 요약 카드를 시드한다(#6).
    setNotes((n) => ({
      ...n,
      [id]: {
        ...EMPTY_NOTE,
        tags: mergeTags([], initialTags),
        sectionSummaries: sectionSummariesFromDetected(next.sections),
      },
    }));
    markDirty(id);
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
    options: { signal?: AbortSignal; onPhase?: (phase: UploadPhase) => void } = {},
  ) {
    setUploadNotice(null);
    const sourceKey = fileSourceKey(file);
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
      const res = await fetch(`${API_BASE}/papers/extract-text`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
        signal: options.signal,
      });
      if (!res.ok) {
        // 입력 가드 위반(크기/암호/페이지 등): 서버 메시지를 표시하고 등록하지 않는다
        let detail = '업로드를 처리할 수 없습니다.';
        try {
          detail = ((await res.json()) as { detail?: string }).detail ?? detail;
        } catch {
          /* ignore */
        }
        setUploadNotice({
          tone: 'error',
          title: res.status === 413 ? '업로드 제한 초과' : 'PDF 처리 실패',
          message: detail,
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
        suggested_tags?: string[];
        metadata_source?: string;
        metadata_confidence?: string;
        metadata_warnings?: string[];
        pdf_url?: string;
        pdf_filename?: string;
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
              pdfUrl: pdfUrl || current.pdfUrl || '',
              pdfFilename: data.pdf_filename || current.pdfFilename || '',
              sections: data.sections ?? current.sections,
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
        markDirty(attachTargetId);
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
          pdfUrl,
          pdfFilename: data.pdf_filename || '',
          sections: data.sections ?? [],
          text: data.text || '',
        }, suggestedTags, uploadPaperId);
      }
      // 스캔/OCR 필요 또는 폰트 인코딩 문제로 추출 품질이 낮으면 안내를 노출한다.
      if (data.notice) {
        setUploadNotice({
          tone: 'warning',
          title: data.scanned ? '스캔 PDF로 보입니다' : '원문 텍스트 확인 필요',
          message: data.notice,
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
            (attachTargetId
              ? '현재 리뷰 노트에 원문 텍스트를 연결했습니다.'
              : '원문 텍스트와 메타정보를 반영해 새 리뷰 노트를 만들었습니다.') + sectionNote,
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
        title: '백엔드 연결 실패',
        message: attachTargetId
          ? 'PDF 텍스트 추출 서버에 연결하지 못했습니다. 현재 노트는 그대로 유지됩니다.'
          : 'PDF 텍스트 추출 서버에 연결하지 못했습니다. 노트는 생성했지만 원문은 나중에 다시 연결해야 합니다.',
      });
    } finally {
      setUploading(false);
      setUploadPhase('idle');
      attachTargetRef.current = null;
    }
  }

  async function handleSamplePdf() {
    if (sampleLoading) return;
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
        const health = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        if (!health.ok) throw new Error(await readErrorDetail(health, '백엔드 상태를 확인하지 못했습니다.'));
        if (controller.signal.aborted) return;
        setUploadNotice({
          tone: 'info',
          title: '샘플 PDF 내려받는 중',
          message: '백엔드가 응답했습니다. 샘플 파일을 받은 뒤 자동으로 본문을 추출합니다.',
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        setUploadNotice({
          tone: 'warning',
          title: '샘플 PDF 재시도 중',
          message: '백엔드 응답이 지연되고 있습니다. 샘플 파일 요청을 한 번 더 시도합니다.',
        });
      }
      setSamplePhase('downloading');
      const res = await fetch(`${API_BASE}/papers/sample-pdf`, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(await readErrorDetail(res, '샘플 PDF를 불러오지 못했습니다.'));
      }
      const blob = await res.blob();
      const filename = 'KCI_FI002116975_250201_164625.pdf';
      setSamplePhase('extracting');
      await handleFile(new File([blob], filename, { type: 'application/pdf', lastModified: 0 }), {
        signal: controller.signal,
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
      setUploadNotice({
        tone: 'error',
        title: '샘플 PDF 불러오기 실패',
        message:
          error instanceof Error
            ? error.message
            : '샘플 PDF를 불러오지 못했습니다. 직접 PDF 업로드를 사용해 주세요.',
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
        message: '본문 원문은 아직 없습니다. 원문 패널에서 PDF를 연결하면 본문을 읽으며 리뷰할 수 있습니다.',
      });
      setDoiInput('');
    } catch {
      // 비DOI 입력·미연동·조회 실패 시에도 등록 흐름이 끊기지 않게 폴백
      setUploadPhase('creating');
      registerPaper({
        title: query,
        authors: '',
        link: query,
        doi: '',
        sourceKey: `manual:${query}`,
        suggestedTags: [],
        metadataSource: 'manual',
        metadataConfidence: 'none',
        metadataWarnings: [],
        text: '[DOI/URL 등록] 메타정보를 가져오지 못했습니다(비DOI이거나 CrossRef 미연동). 제목·저자를 직접 입력하고 리뷰 노트를 작성할 수 있습니다.',
      });
      setUploadNotice({
        tone: 'warning',
        title: '메타정보 조회 실패',
        message: 'DOI 또는 URL을 노트로 등록했습니다. 제목·저자와 PDF 본문은 직접 보완할 수 있습니다.',
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

  function onTextMouseUp(e: React.MouseEvent) {
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
    const a = offsetWithin(container, range.startContainer, range.startOffset);
    const b = offsetWithin(container, range.endContainer, range.endOffset);
    setSelection({ text, start: Math.min(a, b), end: Math.max(a, b), x: e.clientX, y: e.clientY });
  }

  function addHighlight() {
    if (!selection) return;
    setNote((n) => ({
      ...n,
      highlights: [
        ...n.highlights,
        {
          id: uid(),
          text: selection.text,
          color: highlightColor,
          start: selection.start,
          end: selection.end,
        },
      ],
    }));
    setSelection(null);
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

  const bodyNodes = usePaperBodyNodes(paper, note, highlightFilter);

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
  function exportMarkdown() {
    if (!paper) return;
    const blob = new Blob([buildMarkdown(paper, note)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename(paper.title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!paper) return;
    const w = window.open('', '_blank');
    if (!w) {
      window.alert('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.');
      return;
    }
    w.document.write(buildPrintHtml(paper, note));
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
    updateNote,
    registerPaper,
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
  };
}
