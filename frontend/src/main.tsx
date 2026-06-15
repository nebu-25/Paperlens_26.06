import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  Highlighter,
  Library,
  PencilLine,
  Plus,
  Printer,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import './styles.css';

// API 베이스 경로. 기본은 상대경로 '/api'(개발 시 Vite 프록시, 배포 시 동일 오리진/리버스 프록시).
// 다른 오리진의 백엔드를 직접 가리키려면 VITE_API_BASE_URL로 오버라이드한다(예: http://127.0.0.1:8000).
const API_BASE = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api`;

// ──────────────────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────────────────
type Source = 'user' | 'ai_draft';

interface Paper {
  id: string;
  title: string;
  authors: string;
  link: string;
  text: string;
}

interface Highlight {
  id: string;
  text: string;
}

interface Term {
  id: string;
  term: string;
  explanation: string;
  addedByUser: boolean;
  aiExplained: boolean;
}

interface Question {
  id: string;
  text: string;
}

interface SectionSummary {
  id: string;
  section: string;
  content: string;
  source: Source;
}

// 요약 방식: 섹션별 요약(구조형) ↔ 5문항 템플릿(분석형) 중 사용자가 택1
type SummaryMode = 'section' | 'template';

interface ReviewNote {
  oneLineSummary: string;
  oneLineSource: Source;
  summaryMode: SummaryMode;
  tags: string[];
  sectionSummaries: SectionSummary[];
  highlights: Highlight[];
  terms: Term[];
  questions: Question[];
  template: {
    q1: string; // 무엇을 해결하려 하는가
    q2: string; // 어떤 방법
    q3: string; // 결과
    q4: string; // 한계
    q5: string; // 내가 이해한 핵심
  };
  memos: Record<string, string>; // 섹션별 메모 카드
}

const MEMO_SECTIONS = ['Abstract', 'Introduction', 'Method', 'Result', 'Discussion'] as const;

// ③ 섹션별 요약의 기본 섹션. 자동 분류(PAPER.sections) 연동 전까지의 기본값.
const SUMMARY_SECTIONS = ['Introduction', 'Method', 'Result', 'Conclusion'] as const;

const TEMPLATE_QUESTIONS = [
  { key: 'q1', label: '이 논문은 무엇을 해결하려 하는가?' },
  { key: 'q2', label: '어떤 방법을 사용했는가?' },
  { key: 'q3', label: '결과는 무엇인가?' },
  { key: 'q4', label: '한계는 무엇인가?' },
  { key: 'q5', label: '내가 이해한 핵심은 무엇인가?' },
] as const;

const SAMPLE_PAPER: Omit<Paper, 'id'> = {
  title: 'Attention Is All You Need',
  authors: 'Vaswani et al. (2017)',
  link: 'https://arxiv.org/abs/1706.03762',
  text: `We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence.

Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions. The Transformer model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU.`,
};

const uid = () => Math.random().toString(36).slice(2, 9);

const defaultSectionSummaries = (): SectionSummary[] =>
  SUMMARY_SECTIONS.map((section) => ({
    id: uid(),
    section,
    content: '',
    source: 'user' as Source,
  }));

const EMPTY_NOTE: ReviewNote = {
  oneLineSummary: '',
  oneLineSource: 'user',
  summaryMode: 'section',
  tags: [],
  sectionSummaries: defaultSectionSummaries(),
  highlights: [],
  terms: [],
  questions: [],
  template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
  memos: {},
};

// localStorage 키: 논문 라이브러리 + 논문별 노트 + 현재 활성 논문을 한 묶음으로 보관
const STORAGE_KEY = 'paperlens:v1';

// 저장된(옛 스키마 포함) 노트를 현재 스키마로 보정 — sectionSummaries 누락 시 기본 섹션 채움
function normalizeNote(raw: Partial<ReviewNote>): ReviewNote {
  return {
    ...EMPTY_NOTE,
    ...raw,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    sectionSummaries:
      Array.isArray(raw.sectionSummaries) && raw.sectionSummaries.length > 0
        ? raw.sectionSummaries
        : defaultSectionSummaries(),
  };
}

// 지식베이스 검색 대상 텍스트: 메타·태그·작성 내용 전체를 합쳐 소문자로 만든다.
function searchableText(paper: Paper, note: ReviewNote): string {
  const parts: string[] = [paper.title, paper.authors, paper.link, (note.tags ?? []).join(' '), note.oneLineSummary];
  for (const s of note.sectionSummaries ?? []) parts.push(s.section, s.content);
  parts.push(...Object.values(note.template ?? {}));
  for (const t of note.terms ?? []) parts.push(t.term, t.explanation);
  for (const q of note.questions ?? []) parts.push(q.text);
  for (const h of note.highlights ?? []) parts.push(h.text);
  parts.push(...Object.values(note.memos ?? {}));
  return parts.join(' ').toLowerCase();
}

// 규칙 기반 용어 힌트: 대문자 약어(2자 이상), 외래어/영문 토큰을 후보로 본다.
// 기획서 8-2 단서대로 정확도는 제한적이며 보조 안내일 뿐이다.
const HINT_PATTERN = /\b([A-Z]{2,}|[A-Z][a-z]+(?:-[A-Z][a-z]+)*)\b/g;

// ──────────────────────────────────────────────────────────────────────────
// 리뷰 노트 내보내기 (FR-11) — 작성된 9영역을 통합. 토글과 무관하게 내용이 있는
// 섹션별 요약/템플릿을 모두 포함해 사용자가 쓴 내용을 잃지 않는다.
// ──────────────────────────────────────────────────────────────────────────
const safeFilename = (title: string) =>
  (title.replace(/[^\w가-힣 .-]/g, '_').trim().slice(0, 80) || 'review-note');

function buildMarkdown(paper: Paper, note: ReviewNote): string {
  const out: string[] = [];
  out.push(`# ${paper.title || '제목 없음'}`, '');
  out.push(`- 저자: ${paper.authors || '—'}`);
  out.push(`- 링크: ${paper.link || '—'}`);
  out.push(`- 내보낸 날짜: ${new Date().toLocaleString('ko-KR')}`, '');

  if (note.oneLineSummary.trim()) out.push('## 한 줄 요약', '', note.oneLineSummary.trim(), '');

  const sections = note.sectionSummaries.filter((s) => s.content.trim());
  if (sections.length) {
    out.push('## 섹션별 요약', '');
    for (const s of sections) out.push(`### ${s.section}`, '', s.content.trim(), '');
  }

  const tmpl = TEMPLATE_QUESTIONS.filter((q) => note.template[q.key].trim());
  if (tmpl.length) {
    out.push('## 수동 요약 템플릿', '');
    for (const q of tmpl) out.push(`**${q.label}**`, '', note.template[q.key].trim(), '');
  }

  if (note.terms.length) {
    out.push('## 핵심 용어 사전', '');
    for (const t of note.terms) out.push(`- **${t.term}**: ${t.explanation.trim() || '(설명 없음)'}`);
    out.push('');
  }

  if (note.questions.length) {
    out.push('## 읽으며 생긴 질문', '');
    for (const q of note.questions) out.push(`- ${q.text}`);
    out.push('');
  }

  if (note.highlights.length) {
    out.push('## 핵심 문장 하이라이트', '');
    for (const h of note.highlights) out.push(`> ${h.text}`, '');
  }

  const memos = MEMO_SECTIONS.filter((s) => (note.memos[s] ?? '').trim());
  if (memos.length) {
    out.push('## 섹션별 메모 카드', '');
    for (const s of memos) out.push(`### ${s}`, '', (note.memos[s] ?? '').trim(), '');
  }

  return out.join('\n');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const htmlParas = (s: string) =>
  s
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

// 인쇄용 HTML — 새 창에서 열고 사용자가 "PDF로 저장"으로 인쇄한다(추가 라이브러리 없음).
function buildPrintHtml(paper: Paper, note: ReviewNote): string {
  const b: string[] = [];
  b.push(`<h1>${escapeHtml(paper.title || '제목 없음')}</h1>`);
  b.push(
    `<ul class="meta"><li>저자: ${escapeHtml(paper.authors || '—')}</li>` +
      `<li>링크: ${escapeHtml(paper.link || '—')}</li>` +
      `<li>내보낸 날짜: ${escapeHtml(new Date().toLocaleString('ko-KR'))}</li></ul>`,
  );
  if (note.oneLineSummary.trim()) b.push('<h2>한 줄 요약</h2>', htmlParas(note.oneLineSummary));

  const sections = note.sectionSummaries.filter((s) => s.content.trim());
  if (sections.length) {
    b.push('<h2>섹션별 요약</h2>');
    for (const s of sections) b.push(`<h3>${escapeHtml(s.section)}</h3>`, htmlParas(s.content));
  }

  const tmpl = TEMPLATE_QUESTIONS.filter((q) => note.template[q.key].trim());
  if (tmpl.length) {
    b.push('<h2>수동 요약 템플릿</h2>');
    for (const q of tmpl) b.push(`<h3>${escapeHtml(q.label)}</h3>`, htmlParas(note.template[q.key]));
  }

  if (note.terms.length) {
    b.push('<h2>핵심 용어 사전</h2><ul>');
    for (const t of note.terms)
      b.push(`<li><b>${escapeHtml(t.term)}</b>: ${escapeHtml(t.explanation || '(설명 없음)')}</li>`);
    b.push('</ul>');
  }

  if (note.questions.length) {
    b.push('<h2>읽으며 생긴 질문</h2><ul>');
    for (const q of note.questions) b.push(`<li>${escapeHtml(q.text)}</li>`);
    b.push('</ul>');
  }

  if (note.highlights.length) {
    b.push('<h2>핵심 문장 하이라이트</h2>');
    for (const h of note.highlights) b.push(`<blockquote>${escapeHtml(h.text)}</blockquote>`);
  }

  const memos = MEMO_SECTIONS.filter((s) => (note.memos[s] ?? '').trim());
  if (memos.length) {
    b.push('<h2>섹션별 메모 카드</h2>');
    for (const s of memos) b.push(`<h3>${escapeHtml(s)}</h3>`, htmlParas(note.memos[s] ?? ''));
  }

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(
    paper.title || 'PaperLens',
  )}</title><style>
    body{font-family:'Noto Sans KR',system-ui,sans-serif;color:#171717;line-height:1.7;max-width:720px;margin:40px auto;padding:0 20px;}
    h1{font-size:24px;margin:0 0 12px;} h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid #dfdcd3;padding-bottom:4px;}
    h3{font-size:15px;margin:16px 0 4px;} ul.meta{list-style:none;padding:0;color:#66625d;font-size:14px;}
    blockquote{margin:8px 0;padding:8px 14px;background:#fffbe6;border-left:3px solid #f0c000;}
    p{margin:6px 0;}
  </style></head><body>${b.join(
    '',
  )}<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// 공통 UI
// ──────────────────────────────────────────────────────────────────────────
function AiDraftButton({ label = 'AI 초안' }: { label?: string }) {
  return (
    <button
      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted"
      disabled
      title="AI 보조 레이어는 준비 중입니다 (코어 기능은 AI 없이 동작)"
    >
      <Sparkles size={12} />
      {label} · 준비 중
    </button>
  );
}

function SourceBadge({ filled, source }: { filled: boolean; source: Source }) {
  if (!filled) return null;
  if (source === 'ai_draft') {
    return <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">초안</span>;
  }
  return (
    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">내가 작성</span>
  );
}

function SectionCard({
  title,
  icon,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded border border-line bg-white p-4">
      <div className={`flex items-center justify-between gap-3 ${open ? 'mb-3' : ''}`}>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={`shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </h3>
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 앱
// ──────────────────────────────────────────────────────────────────────────
function App() {
  // 논문별로 보관: library[id] = 논문, notes[id] = 그 논문의 리뷰 노트
  const [library, setLibrary] = useState<Record<string, Paper>>({});
  const [notes, setNotes] = useState<Record<string, ReviewNote>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [doiInput, setDoiInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [doiLoading, setDoiLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState(0); // 서버에 아직 반영 안 된(dirty) 노트 수
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  function registerPaper(next: Omit<Paper, 'id'>) {
    const id = uid();
    setLibrary((l) => ({ ...l, [id]: { ...next, id } }));
    // 논문마다 자체 섹션 배열을 갖도록 새 노트를 생성한다.
    setNotes((n) => ({ ...n, [id]: { ...EMPTY_NOTE, sectionSummaries: defaultSectionSummaries() } }));
    markDirty(id);
    setActiveId(id);
    setSelection(null);
    setSavedAt(null);
  }

  function openPaper(id: string) {
    setActiveId(id);
    setSelection(null);
    setSavedAt('복원됨');
  }

  function deletePaper(id: string) {
    dirtyRef.current.delete(id);
    setPending(dirtyRef.current.size);
    setLibrary(({ [id]: _omitP, ...rest }) => rest);
    setNotes(({ [id]: _omitN, ...rest }) => rest);
    setActiveId((cur) => (cur === id ? null : cur));
    fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/papers/extract-text`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('extract failed');
      const data: {
        filename: string;
        text: string;
        title?: string;
        authors?: string;
        link?: string;
      } = await res.json();
      const unknownTitle = !data.title || data.title === '(제목 없음)';
      const unknownAuthors = !data.authors || data.authors === '저자 미상';
      registerPaper({
        title: unknownTitle ? file.name.replace(/\.pdf$/i, '') : (data.title ?? ''),
        authors: unknownAuthors ? '' : (data.authors ?? ''),
        link: data.link || '',
        text: data.text || '(본문 텍스트가 비어 있습니다)',
      });
    } catch {
      // 백엔드 미연동 시에도 등록 흐름은 끊기지 않게 폴백
      registerPaper({
        title: file.name.replace(/\.pdf$/i, ''),
        authors: '저자 미상',
        link: '',
        text: '[백엔드 미연동] PDF 텍스트 추출 API에 연결되지 않아 본문을 표시할 수 없습니다. 백엔드(uvicorn)를 실행하면 추출됩니다. 그동안에도 노트 작성 기능은 정상 동작합니다.',
      });
    } finally {
      setUploading(false);
    }
  }

  async function registerByDoi() {
    const query = doiInput.trim();
    if (!query) return;
    setDoiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/papers/metadata?doi=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('metadata failed');
      const data: { title: string; authors: string; link: string } = await res.json();
      registerPaper({
        title: data.title === '(제목 없음)' ? '' : data.title,
        authors: data.authors === '저자 미상' ? '' : data.authors,
        link: data.link,
        text: '[DOI 등록] CrossRef에서 메타정보를 가져왔습니다. 본문 가져오기는 후속 작업이며, 지금도 리뷰 노트는 직접 작성할 수 있습니다.',
      });
      setDoiInput('');
    } catch {
      // 비DOI 입력·미연동·조회 실패 시에도 등록 흐름이 끊기지 않게 폴백
      registerPaper({
        title: query,
        authors: '',
        link: query,
        text: '[DOI/URL 등록] 메타정보를 가져오지 못했습니다(비DOI이거나 CrossRef 미연동). 제목·저자를 직접 입력하고 리뷰 노트를 작성할 수 있습니다.',
      });
      setDoiInput('');
    } finally {
      setDoiLoading(false);
    }
  }

  // ── 본문 드래그 → 하이라이트 / 용어 추가 (FS-02, FS-03) ──
  function onTextMouseUp(e: React.MouseEvent) {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text.length === 0) {
      setSelection(null);
      return;
    }
    setSelection({ text, x: e.clientX, y: e.clientY });
  }

  function addHighlight() {
    if (!selection) return;
    setNote((n) => ({ ...n, highlights: [...n.highlights, { id: uid(), text: selection.text }] }));
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

  // 본문에 옅은 밑줄 힌트 적용 (코어, 규칙 기반)
  const hintedBody = useMemo(() => {
    if (!paper) return null;
    return paper.text.split('\n\n').map((para, pi) => {
      const parts: React.ReactNode[] = [];
      let last = 0;
      for (const m of para.matchAll(HINT_PATTERN)) {
        const start = m.index ?? 0;
        if (start > last) parts.push(para.slice(last, start));
        parts.push(
          <span key={`${pi}-${start}`} className="border-b border-dotted border-action/60">
            {m[0]}
          </span>,
        );
        last = start + m[0].length;
      }
      if (last < para.length) parts.push(para.slice(last));
      return (
        <p key={pi} className="mb-4">
          {parts}
        </p>
      );
    });
  }, [paper]);

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

  return (
    <main className="min-h-screen bg-paper text-ink" onMouseDown={() => setSelection(null)}>
      <header className="flex items-center justify-between border-b border-line bg-panel px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded bg-action text-white">
            <FileText size={18} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">PaperLens</h1>
            <p className="text-xs text-muted">사용자 주도 논문 리뷰 노트</p>
          </div>
        </div>
        <span className="rounded bg-paper px-3 py-1 text-xs text-muted">
          코어 MVP · AI 보조 준비 중
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* ── 사이드바 ── */}
        <aside className="border-b border-line bg-panel p-5 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            새 논문 등록
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            className="flex w-full items-center justify-center gap-2 rounded bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={16} />
            {uploading ? '추출 중…' : 'PDF 업로드'}
          </button>
          <div className="mt-3 flex gap-2">
            <input
              className="w-full rounded border border-line bg-white px-3 py-2 text-sm outline-none focus:border-action disabled:opacity-60"
              placeholder="DOI 또는 URL"
              value={doiInput}
              disabled={doiLoading}
              onChange={(e) => setDoiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && registerByDoi()}
            />
            <button
              className="shrink-0 rounded border border-line px-3 text-sm disabled:opacity-60"
              onClick={registerByDoi}
              disabled={doiLoading}
            >
              {doiLoading ? '조회 중…' : '등록'}
            </button>
          </div>
          <button
            className="mt-3 w-full rounded border border-dashed border-line px-3 py-2 text-xs text-muted"
            onClick={() => registerPaper(SAMPLE_PAPER)}
          >
            샘플 논문으로 체험하기
          </button>

          <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-muted">
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
          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
            {/* 원문 패널 */}
            <article className="border-b border-line bg-white p-6 xl:border-b-0 xl:border-r">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">원문 패널</h2>
                <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
              </div>
              <p className="mb-4 text-xs text-muted">
                문장을 드래그하면 <b>하이라이트</b> 또는 <b>용어 사전 추가</b>를 할 수 있습니다.
                옅은 밑줄은 전문용어 추정 힌트(보조)입니다.
              </p>
              <div
                className="select-text text-sm leading-7 text-neutral-800"
                onMouseUp={onTextMouseUp}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {hintedBody}
              </div>
            </article>

            {/* 리뷰 노트 패널 (9영역) */}
            <article className="bg-paper p-6">
              <div className="mb-4 flex items-center justify-between">
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

              <div className="space-y-4">
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
                          className="flex items-start justify-between gap-2 rounded bg-yellow-50 p-2 text-sm"
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
          </section>
        )}
      </div>

      {/* 드래그 선택 플로팅 툴바 */}
      {selection && (
        <div
          className="fixed z-50 flex gap-1 rounded border border-line bg-white p-1 shadow-lg"
          style={{ left: selection.x, top: selection.y + 12 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
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

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const t = draft.trim().replace(/^#+/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  }
  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full bg-action/10 px-2 py-0.5 text-xs text-action"
            >
              #{t}
              <button
                className="leading-none hover:text-ink"
                title="태그 삭제"
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="w-full rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-action"
        placeholder="태그 추가 (Enter)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

function QuestionsCard({
  questions,
  onChange,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    if (!draft.trim()) return;
    onChange([...questions, { id: uid(), text: draft.trim() }]);
    setDraft('');
  }
  return (
    <SectionCard title="읽으며 생긴 질문" icon={<PencilLine size={16} />}>
      <div className="mb-2 flex gap-2">
        <input
          className="w-full rounded border border-line p-2 text-sm outline-none focus:border-action"
          placeholder="읽다가 생긴 질문을 기록하세요."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          className="flex shrink-0 items-center gap-1 rounded border border-line px-3 text-sm"
          onClick={add}
        >
          <Plus size={14} /> 추가
        </button>
      </div>
      {questions.length > 0 && (
        <ul className="space-y-1">
          {questions.map((q) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-2 rounded bg-paper p-2 text-sm"
            >
              <span>Q. {q.text}</span>
              <button
                className="shrink-0 text-muted hover:text-ink"
                onClick={() => onChange(questions.filter((x) => x.id !== q.id))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EmptyState() {
  return (
    <section className="grid place-items-center p-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-panel text-action">
          <FileText size={26} />
        </div>
        <h2 className="mb-2 text-lg font-semibold">논문을 등록해 리뷰 노트를 시작하세요</h2>
        <p className="text-sm leading-6 text-muted">
          PDF 업로드 또는 DOI/URL로 논문을 등록하면 좌측 원문 패널과 우측 리뷰 노트(9영역)가
          열립니다. AI 보조 없이도 작성·하이라이트·메모가 모두 동작합니다.
        </p>
      </div>
    </section>
  );
}

export default App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
