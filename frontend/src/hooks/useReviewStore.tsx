// PaperLens 핵심 상태/영속화/액션 훅. App 컴포넌트의 모든 비-뷰 로직을 담는다.
// 논문 라이브러리·노트 상태, 서버/로컬 동기화, 업로드·등록·하이라이트·내보내기 액션을 제공한다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, STORAGE_KEY } from '../constants';
import { highlightStyle, renderHints } from '../lib/format';
import { buildMarkdown, buildPrintHtml, safeFilename } from '../lib/export';
import {
  EMPTY_NOTE,
  detectedSectionNames,
  fileSourceKey,
  mergeTags,
  normalizeNote,
  searchableText,
  sectionSummariesFromDetected,
  uid,
} from '../lib/notes';
import type {
  AppNotice,
  DetectedSection,
  HighlightColor,
  Paper,
  ReviewNote,
  SectionSummary,
  UploadPhase,
} from '../types';

export function useReviewStore() {
  // 논문별로 보관: library[id] = 논문, notes[id] = 그 논문의 리뷰 노트
  const [library, setLibrary] = useState<Record<string, Paper>>({});
  const [notes, setNotes] = useState<Record<string, ReviewNote>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [doiInput, setDoiInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [doiLoading, setDoiLoading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<AppNotice | null>(null); // 업로드 가드 오류/안내
  const [uploadOpen, setUploadOpen] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0); // 서버에 아직 반영 안 된(dirty) 노트 수
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'paper' | 'review'>('paper');
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
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

  const paper = activeId ? library[activeId] ?? null : null;
  const note = (activeId ? notes[activeId] : undefined) ?? EMPTY_NOTE;

  // 저장 유실 방지: 변경된 노트를 dirty로 추적하고, 최신 상태를 ref로 보관(언로드/flush 참조용)
  const libraryRef = useRef(library);
  const notesRef = useRef(notes);
  const activeIdRef = useRef(activeId);
  const dirtyRef = useRef<Set<string>>(new Set());
  libraryRef.current = library;
  notesRef.current = notes;
  activeIdRef.current = activeId;

  const markDirty = useCallback((id: string | null) => {
    if (!id) return;
    dirtyRef.current.add(id);
    setPending(dirtyRef.current.size);
  }, []);

  // dirty 노트를 전부 서버에 PUT + localStorage 미러. 전환해도 직전 노트가 유실되지 않는다.
  const flush = useCallback(async () => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          library: libraryRef.current,
          notes: notesRef.current,
          activeId: activeIdRef.current,
        }),
      );
    } catch {
      /* ignore */
    }
    const ids = Array.from(dirtyRef.current);
    if (ids.length === 0) return;
    let savedAny = false;
    let failed = false;
    for (const id of ids) {
      const p = libraryRef.current[id];
      if (!p) {
        dirtyRef.current.delete(id);
        continue;
      }
      try {
        const res = await fetch(`${API_BASE}/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper: p, note: notesRef.current[id] ?? EMPTY_NOTE }),
        });
        if (!res.ok) throw new Error('save failed');
        dirtyRef.current.delete(id);
        savedAny = true;
      } catch {
        failed = true;
      }
    }
    setPending(dirtyRef.current.size);
    const time = new Date().toLocaleTimeString('ko-KR');
    if (failed) {
      setOnline(false);
      setSavedAt(`로컬 저장 ${time} (오프라인)`);
    } else if (savedAny) {
      setOnline(true);
      setSavedAt(`서버 저장 ${time}`);
    }
  }, []);

  // 목록 응답은 본문(text)을 제외하므로, 논문을 열 때 단건 조회로 원문을 지연 로드한다(#10).
  const ensureText = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { paper: Paper };
      setLibrary((lib) => {
        const cur = lib[id];
        // 이미 본문이 있거나 받은 본문이 비었으면(스캔본 등) 갱신하지 않는다(무한 재요청 방지)
        if (!cur || cur.text || !data.paper.text) return lib;
        return { ...lib, [id]: { ...cur, text: data.paper.text } };
      });
    } catch {
      /* 오프라인이면 원문은 비표시 */
    }
  }, []);

  // ── 시작 시 서버에서 불러오고, 실패하면 localStorage로 폴백 ──
  useEffect(() => {
    let cancelled = false;
    // 마지막으로 열어둔 논문 힌트만 localStorage에서 미리 읽는다(activeId는 서버에 저장 안 함).
    let activeHint: string | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) activeHint = (JSON.parse(raw) as { activeId?: string | null }).activeId ?? null;
    } catch {
      /* ignore */
    }

    const apply = (lib: Record<string, Paper>, rawNotes: Record<string, ReviewNote>) => {
      const fixed: Record<string, ReviewNote> = {};
      for (const [id, n] of Object.entries(rawNotes)) fixed[id] = normalizeNote(n);
      setLibrary(lib);
      setNotes(fixed);
      const ids = Object.keys(lib);
      setActiveId(activeHint && ids.includes(activeHint) ? activeHint : null);
    };

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/notes`);
        if (!res.ok) throw new Error('server unavailable');
        const data = (await res.json()) as {
          library?: Record<string, Paper>;
          notes?: Record<string, ReviewNote>;
        };
        if (cancelled) return;
        apply(data.library ?? {}, data.notes ?? {});
        setOnline(true);
        if (Object.keys(data.library ?? {}).length > 0) setSavedAt('서버에서 불러옴');
      } catch {
        // 오프라인: localStorage 캐시로 폴백
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw && !cancelled) {
            const data = JSON.parse(raw) as {
              library?: Record<string, Paper>;
              notes?: Record<string, ReviewNote>;
            };
            apply(data.library ?? {}, data.notes ?? {});
            // 서버에 미반영일 수 있는 로컬 노트를 재동기 대상으로 표시(서버 복구 시 push)
            for (const id of Object.keys(data.library ?? {})) dirtyRef.current.add(id);
            setPending(dirtyRef.current.size);
            if (Object.keys(data.library ?? {}).length > 0) setSavedAt('로컬 복원(오프라인)');
          }
        } catch {
          /* 손상된 캐시는 무시 */
        }
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── 자동 저장 (5초 debounce, NFR-05): dirty 노트를 전부 저장. 복원 후에만 동작 ──
  useEffect(() => {
    if (!loaded) return;
    const handle = window.setTimeout(() => {
      void flush();
    }, 5000);
    return () => window.clearTimeout(handle);
  }, [library, notes, activeId, loaded, flush]);

  // ── 오프라인→온라인 재동기화: 미동기 노트가 있으면 주기적으로/온라인 복귀 시 재시도 ──
  // (서버 다운은 navigator.onLine으로 감지 안 되므로 폴링이 필요하다)
  useEffect(() => {
    if (!loaded) return;
    const retry = () => {
      if (dirtyRef.current.size > 0) void flush();
    };
    const interval = window.setInterval(retry, 10000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
    };
  }, [loaded, flush]);

  // ── 활성 논문의 원문 지연 로드(#10): 목록엔 본문이 없으므로 열릴 때 단건 조회 ──
  useEffect(() => {
    if (activeId && online && !library[activeId]?.text) void ensureText(activeId);
  }, [activeId, online, library, ensureText]);

  // ── 탭 닫기·숨김 시 강제 저장(유실 방지): keepalive PUT + 로컬 미러 ──
  useEffect(() => {
    const flushOnHide = () => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            library: libraryRef.current,
            notes: notesRef.current,
            activeId: activeIdRef.current,
          }),
        );
      } catch {
        /* ignore */
      }
      for (const id of Array.from(dirtyRef.current)) {
        const p = libraryRef.current[id];
        if (!p) continue;
        // keepalive: 페이지가 언로드되는 중에도 요청이 완료되도록 한다.
        void fetch(`${API_BASE}/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paper: p, note: notesRef.current[id] ?? EMPTY_NOTE }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ── 활성 논문의 노트만 갱신 ──
  function setNote(updater: (n: ReviewNote) => ReviewNote) {
    if (!activeId) return;
    markDirty(activeId);
    setNotes((all) => ({ ...all, [activeId]: updater(all[activeId] ?? EMPTY_NOTE) }));
  }

  const setSectionSummaries = (next: SectionSummary[]) =>
    setNote((n) => ({ ...n, sectionSummaries: next }));

  const setTags = (next: string[]) => setNote((n) => ({ ...n, tags: next }));

  // 활성 논문의 메타정보(제목/저자/링크) 직접 편집 — 자동 추출 실패 시 보완
  function updatePaper(patch: Partial<Omit<Paper, 'id'>>) {
    if (!activeId) return;
    markDirty(activeId);
    setLibrary((lib) => (lib[activeId] ? { ...lib, [activeId]: { ...lib[activeId], ...patch } } : lib));
  }

  // ── 논문 등록 (#2: 논문별로 누적, 덮어쓰지 않음) ──
  function registerPaper(next: Omit<Paper, 'id'>, initialTags: string[] = []) {
    const id = uid();
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
    dirtyRef.current.delete(id);
    setPending(dirtyRef.current.size);
    setLibrary((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveId((cur) => (cur === id ? null : cur));
    fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function handleFile(file: File) {
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
    try {
      const form = new FormData();
      form.append('file', file);
      setUploadPhase('extracting');
      const res = await fetch(`${API_BASE}/papers/extract-text`, { method: 'POST', body: form });
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
        scanned?: boolean;
        notice?: string | null;
      } = await res.json();
      const unknownTitle = !data.title || data.title === '(제목 없음)';
      const unknownAuthors = !data.authors || data.authors === '저자 미상';
      const suggestedTags = data.suggested_tags ?? [];
      setUploadPhase('creating');
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
              metadataWarnings: data.metadata_warnings ?? [],
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
          metadataWarnings: data.metadata_warnings ?? [],
          sections: data.sections ?? [],
          text: data.text || '',
        }, suggestedTags);
      }
      // 스캔(이미지) PDF면 OCR 안내를 노출(등록은 진행 — 노트는 직접 작성 가능)
      if (data.scanned && data.notice) {
        setUploadNotice({
          tone: 'warning',
          title: '스캔 PDF로 보입니다',
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
    } catch {
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

  // 원문 렌더: 하이라이트 구간은 <mark>로, 그 외 구간은 밑줄 힌트를 적용. (pre-wrap 컨테이너)
  const bodyNodes = useMemo(() => {
    const text = paper?.text ?? '';
    if (!text) return null;
    const ranges = (
      (note.highlights ?? [])
        .map((h): { start: number; end: number; color?: HighlightColor } | null => {
          // 오프셋이 있으면 그대로 사용
          if (
            typeof h.start === 'number' &&
            typeof h.end === 'number' &&
            h.start >= 0 &&
            h.end <= text.length &&
            h.end > h.start
          ) {
            return { start: h.start, end: h.end, color: h.color };
          }
          // 오프셋 없는(옛) 하이라이트: 본문에서 텍스트를 찾아 위치 추정(첫 출현)
          if (h.text) {
            const idx = text.indexOf(h.text);
            if (idx >= 0) return { start: idx, end: idx + h.text.length, color: h.color };
          }
          return null;
        })
        .filter((r): r is { start: number; end: number; color?: HighlightColor } => r !== null)
        .sort((a, b) => a.start - b.start)
    );
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const range of ranges) {
      const s = Math.max(range.start, cursor);
      const e = range.end;
      if (e <= cursor) continue;
      if (s > cursor) nodes.push(...renderHints(text.slice(cursor, s), cursor));
      const color = highlightStyle(range.color);
      nodes.push(
        <mark key={`hl-${s}-${e}`} className={`rounded ${color.markClass} text-ink`}>
          {text.slice(s, e)}
        </mark>,
      );
      cursor = e;
    }
    if (cursor < text.length) nodes.push(...renderHints(text.slice(cursor), cursor));
    return nodes;
  }, [paper?.text, note.highlights]);

  const updateNote = <K extends keyof ReviewNote>(key: K, value: ReviewNote[K]) =>
    setNote((n) => ({ ...n, [key]: value }));

  // ⑨ 전체 리뷰 노트 완성도 체크리스트
  const summaryDone =
    note.summaryMode === 'section'
      ? note.sectionSummaries.some((s) => s.content.trim().length > 0)
      : Object.values(note.template).some((v) => v.trim().length > 0);
  const checklist = [
    { label: '한 줄 요약', done: note.oneLineSummary.trim().length > 0 },
    { label: note.summaryMode === 'section' ? '섹션별 요약' : '5문항 템플릿', done: summaryDone },
    { label: '핵심 문장 하이라이트', done: note.highlights.length > 0 },
    { label: '핵심 용어 사전', done: note.terms.length > 0 },
    { label: '읽으며 생긴 질문', done: note.questions.length > 0 },
    { label: '섹션별 메모', done: Object.values(note.memos).some((v) => v.trim().length > 0) },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  // ── 지식베이스 검색·태그 필터 (FR-09) ──
  const allTags = Array.from(
    new Set(Object.values(notes).flatMap((n) => n.tags ?? [])),
  ).sort((a, b) => a.localeCompare(b, 'ko'));
  const query = search.trim().toLowerCase();
  const visiblePapers = Object.values(library).filter((p) => {
    const n = notes[p.id] ?? EMPTY_NOTE;
    if (activeTags.length > 0 && !activeTags.every((t) => (n.tags ?? []).includes(t))) return false;
    if (query && !searchableText(p, n).includes(query)) return false;
    return true;
  });
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
    setSelection,
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
    registerByDoi,
    onTextMouseUp,
    addHighlight,
    addTerm,
    toggleTagFilter,
    exportMarkdown,
    exportPdf,
  };
}
