import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  FileText,
  Highlighter,
  Library,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import './styles.css';

// 백엔드 PDF 텍스트 추출 API. 미연동/실패 시에도 코어는 동작한다.
const API_BASE = 'http://127.0.0.1:8000/api';

// ──────────────────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────────────────
type Source = 'user' | 'ai_draft';

interface Paper {
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

interface ReviewNote {
  oneLineSummary: string;
  oneLineSource: Source;
  sectionSummary: string;
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

const TEMPLATE_QUESTIONS = [
  { key: 'q1', label: '이 논문은 무엇을 해결하려 하는가?' },
  { key: 'q2', label: '어떤 방법을 사용했는가?' },
  { key: 'q3', label: '결과는 무엇인가?' },
  { key: 'q4', label: '한계는 무엇인가?' },
  { key: 'q5', label: '내가 이해한 핵심은 무엇인가?' },
] as const;

const SAMPLE_PAPER: Paper = {
  title: 'Attention Is All You Need',
  authors: 'Vaswani et al. (2017)',
  link: 'https://arxiv.org/abs/1706.03762',
  text: `We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence.

Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions. The Transformer model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU.`,
};

const EMPTY_NOTE: ReviewNote = {
  oneLineSummary: '',
  oneLineSource: 'user',
  sectionSummary: '',
  highlights: [],
  terms: [],
  questions: [],
  template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
  memos: {},
};

const uid = () => Math.random().toString(36).slice(2, 9);

// 규칙 기반 용어 힌트: 대문자 약어(2자 이상), 외래어/영문 토큰을 후보로 본다.
// 기획서 8-2 단서대로 정확도는 제한적이며 보조 안내일 뿐이다.
const HINT_PATTERN = /\b([A-Z]{2,}|[A-Z][a-z]+(?:-[A-Z][a-z]+)*)\b/g;

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
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 앱
// ──────────────────────────────────────────────────────────────────────────
function App() {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [note, setNote] = useState<ReviewNote>(EMPTY_NOTE);
  const [doiInput, setDoiInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 자동 저장 (5초 debounce, NFR-05) ──
  useEffect(() => {
    if (!paper) return;
    const handle = window.setTimeout(() => {
      window.localStorage.setItem('paperlens:note', JSON.stringify({ paper, note }));
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    }, 5000);
    return () => window.clearTimeout(handle);
  }, [paper, note]);

  // ── 논문 등록 ──
  function registerPaper(next: Paper) {
    setPaper(next);
    setNote(EMPTY_NOTE);
    setSavedAt(null);
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/papers/extract-text`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('extract failed');
      const data: { filename: string; text: string } = await res.json();
      registerPaper({
        title: file.name.replace(/\.pdf$/i, ''),
        authors: '저자 미상 (메타정보 추출 예정)',
        link: '',
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

  function registerByDoi() {
    if (!doiInput.trim()) return;
    registerPaper({
      title: doiInput.trim(),
      authors: '저자 미상 (CrossRef 연동 예정)',
      link: doiInput.trim(),
      text: '[DOI/URL 등록] 메타정보 추출(CrossRef)·본문 가져오기는 백엔드 연동 후 채워집니다. 지금도 우측 리뷰 노트는 직접 작성할 수 있습니다.',
    });
    setDoiInput('');
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
              className="w-full rounded border border-line bg-white px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="DOI 또는 URL"
              value={doiInput}
              onChange={(e) => setDoiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && registerByDoi()}
            />
            <button
              className="shrink-0 rounded border border-line px-3 text-sm"
              onClick={registerByDoi}
            >
              등록
            </button>
          </div>
          <button
            className="mt-3 w-full rounded border border-dashed border-line px-3 py-2 text-xs text-muted"
            onClick={() => registerPaper(SAMPLE_PAPER)}
          >
            샘플 논문으로 체험하기
          </button>

          <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-muted">
            내 리뷰 노트
          </p>
          {paper ? (
            <div className="rounded border border-line bg-white px-3 py-3 text-sm">
              <div className="line-clamp-1 font-medium">{paper.title}</div>
              <span className="mt-1 inline-block rounded bg-paper px-2 py-0.5 text-xs text-muted">
                작성중
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted">아직 등록된 논문이 없습니다.</p>
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
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  <Save size={12} />
                  {savedAt ? `저장됨 ${savedAt}` : '자동 저장 대기'}
                </span>
              </div>

              <div className="space-y-4">
                {/* ① 논문 메타정보 */}
                <SectionCard title="① 논문 메타정보" icon={<FileText size={16} />}>
                  <dl className="space-y-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-muted">제목</dt>
                      <dd>{paper.title}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-muted">저자</dt>
                      <dd>{paper.authors}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-muted">링크</dt>
                      <dd className="break-all text-action">{paper.link || '—'}</dd>
                    </div>
                  </dl>
                </SectionCard>

                {/* ② 한 줄 요약 */}
                <SectionCard
                  title="② 한 줄 요약"
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

                {/* ③ 섹션별 요약 */}
                <SectionCard
                  title="③ 섹션별 요약"
                  icon={<PencilLine size={16} />}
                  action={note.sectionSummary.length === 0 ? <AiDraftButton /> : undefined}
                >
                  <textarea
                    className="min-h-24 w-full resize-none rounded border border-line p-3 text-sm outline-none focus:border-action"
                    placeholder="섹션(서론/방법/결과/결론)별 요약을 직접 작성하세요."
                    value={note.sectionSummary}
                    onChange={(e) => updateNote('sectionSummary', e.target.value)}
                  />
                </SectionCard>

                {/* ④ 핵심 용어 사전 */}
                <SectionCard title="④ 핵심 용어 사전" icon={<Library size={16} />}>
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

                {/* ⑤ 읽으며 생긴 질문 */}
                <QuestionsCard
                  questions={note.questions}
                  onChange={(q) => updateNote('questions', q)}
                />

                {/* ⑥ 핵심 문장 하이라이트 */}
                <SectionCard title="⑥ 핵심 문장 하이라이트" icon={<Highlighter size={16} />}>
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

                {/* ⑦ 수동 요약 템플릿 (5문항) */}
                <SectionCard title="⑦ 수동 요약 템플릿" icon={<PencilLine size={16} />}>
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

                {/* ⑧ 섹션별 메모 카드 */}
                <SectionCard title="⑧ 섹션별 메모 카드" icon={<PencilLine size={16} />}>
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

                {/* ⑨ 전체 리뷰 노트 (통합 미리보기) */}
                <SectionCard title="⑨ 전체 리뷰 노트" icon={<FileText size={16} />}>
                  <p className="text-xs text-muted">
                    하이라이트 {note.highlights.length}개 · 용어 {note.terms.length}개 · 질문{' '}
                    {note.questions.length}개 · 메모{' '}
                    {Object.values(note.memos).filter(Boolean).length}개가 통합 저장됩니다.
                    내보내기(PDF/Markdown)는 후속 작업으로 연결합니다.
                  </p>
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
    <SectionCard title="⑤ 읽으며 생긴 질문" icon={<PencilLine size={16} />}>
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
