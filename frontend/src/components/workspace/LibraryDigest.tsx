// 라이브러리 취합(FR-25) + 연구 질문 빌더(FR-28) 오버레이 — 기획서 v4.0 §8-6/§8-8.
// 취합은 사용자가 분류해 둔 것의 집계이고, 빌더는 그 재료로 공백→질문을 잡는
// 프로젝트 레벨 도구다. 둘 다 AI 미사용(코어).
import { Download, Layers, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, CITATION_USE_OPTIONS, HIGHLIGHT_COLORS } from '../../constants';
import {
  AGGREGATE_ALL,
  aggregateLibrary,
  buildAggregateMarkdown,
  collectBuilderMaterials,
  filterAggregated,
} from '../../lib/aggregate';
import type { AggregateFilter } from '../../lib/aggregate';
import { safeFilename } from '../../lib/export';
import { highlightStyle } from '../../lib/format';
import { authHeaders as buildAuthHeaders } from '../../lib/authHeaders';
import {
  EXPANSION_QUESTIONS,
  RESEARCH_FRAMES,
  buildResearchMarkdown,
  normalizeResearchDoc,
  pickNewerDoc,
  resolveFrame,
} from '../../lib/researchFrames';
import type { ResearchQuestionDoc } from '../../lib/researchFrames';
import type { CitationUse, HighlightColor } from '../../types';
import { useWorkspace } from './WorkspaceContext';

// 프로젝트 문서 저장 키 (MVP: localStorage, §13 데이터 모델)
export const RESEARCH_DOC_STORAGE_KEY = 'paperlens:research:v1';

function loadResearchDoc(storageKey: string): ResearchQuestionDoc {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return normalizeResearchDoc(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeResearchDoc(null);
  }
}

function downloadMarkdown(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type DigestTab = 'aggregate' | 'builder';
type SyncState = 'idle' | 'saving' | 'synced' | 'local';

const SYNC_LABEL: Record<SyncState, string> = {
  idle: '',
  saving: '서버 저장 중…',
  synced: '서버에 저장됨',
  local: '로컬에만 저장됨 (서버 미연결)',
};

export function LibraryDigest({ onClose }: { onClose: () => void }) {
  const { store, accessToken, demoSessionId, requestSurveyPrompt } = useWorkspace();
  const { library, notes, openAggregatedItem } = store;
  const storageKey = demoSessionId
    ? `${RESEARCH_DOC_STORAGE_KEY}:demo:${demoSessionId}`
    : RESEARCH_DOC_STORAGE_KEY;
  // 역링크: 오버레이를 닫고 해당 논문/하이라이트로 이동
  const jumpToItem = (paperId: string, itemId: string) => {
    openAggregatedItem(paperId, itemId);
    onClose();
  };
  const [tab, setTab] = useState<DigestTab>('aggregate');
  const [filter, setFilter] = useState<AggregateFilter>(AGGREGATE_ALL);
  const [doc, setDoc] = useState<ResearchQuestionDoc>(() => loadResearchDoc(storageKey));
  const [expansionOpen, setExpansionOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  // 사용자가 수정한 뒤에만 서버 PUT을 보낸다 (초기 로드/서버 복원은 dirty 아님)
  const dirtyRef = useRef(false);
  const authHeaders = useMemo<Record<string, string>>(
    () => buildAuthHeaders(accessToken, demoSessionId),
    [accessToken, demoSessionId],
  );

  // 사용자 수정 진입점: updatedAt 갱신 + dirty 표시 (last-write-wins 재료)
  const updateDoc = (mutate: (current: ResearchQuestionDoc) => ResearchQuestionDoc) => {
    dirtyRef.current = true;
    setDoc((current) => ({ ...mutate(current), updatedAt: new Date().toISOString() }));
  };

  // 열 때 서버 문서를 불러와 로컬과 비교 — 최근 수정본이 이긴다 (§13 last-write-wins).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/research-doc`, { headers: authHeaders });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { doc?: unknown; updatedAt?: string | null };
        if (!data.doc) return;
        const server = normalizeResearchDoc({
          ...(data.doc as Record<string, unknown>),
          updatedAt: data.updatedAt ?? undefined,
        });
        setDoc((current) => (dirtyRef.current ? current : pickNewerDoc(current, server)));
        setSyncState('synced');
      } catch {
        /* 서버 미연결 — 로컬 문서 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 변경 시 localStorage 즉시 저장(오프라인 캐시) + 서버 PUT은 debounce.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(doc));
    } catch {
      /* 저장 실패는 조용히 무시 — 다음 변경에서 재시도 */
    }
    if (!dirtyRef.current) return;
    setSyncState('saving');
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/research-doc`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ doc }),
        });
        if (res.ok) {
          dirtyRef.current = false;
          setSyncState('synced');
        } else {
          setSyncState('local');
        }
      } catch {
        setSyncState('local');
      }
    }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, storageKey]);

  const allItems = useMemo(() => aggregateLibrary(library, notes), [library, notes]);
  const items = useMemo(() => filterAggregated(allItems, filter), [allItems, filter]);
  const materials = useMemo(() => collectBuilderMaterials(library, notes), [library, notes]);
  const paperGroups = useMemo(() => {
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const group = groups.get(item.paperId) ?? [];
      group.push(item);
      groups.set(item.paperId, group);
    }
    return [...groups.values()];
  }, [items]);

  const frame = resolveFrame(doc.frameId);
  const frameAnswers = doc.slots[frame.id] ?? {};
  const setSlotAnswer = (key: string, value: string) =>
    updateDoc((current) => ({
      ...current,
      slots: { ...current.slots, [frame.id]: { ...(current.slots[frame.id] ?? {}), [key]: value } },
    }));

  const chip = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-xs ${
      active ? 'bg-action text-white' : 'border border-line text-muted hover:border-action hover:text-action'
    }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="라이브러리 취합과 연구 질문 빌더"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-line bg-paper shadow-xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-4 py-3">
          <Layers size={16} className="text-action" />
          <div className="flex gap-1" role="tablist" aria-label="취합/빌더 전환">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'aggregate'}
              className={`rounded px-3 py-1.5 text-base font-semibold ${
                tab === 'aggregate' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
              }`}
              onClick={() => setTab('aggregate')}
            >
              라이브러리 취합
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'builder'}
              className={`rounded px-3 py-1.5 text-base font-semibold ${
                tab === 'builder' ? 'bg-action text-white' : 'text-muted hover:bg-paper'
              }`}
              onClick={() => setTab('builder')}
            >
              연구 질문 빌더
            </button>
          </div>
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            className="rounded p-1 text-muted hover:bg-paper hover:text-ink"
            aria-label="취합 화면 닫기"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {tab === 'aggregate' ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                내 라이브러리 전체에서 라벨·인용 목적별로 문장을 회수합니다. 사용자가 분류해 둔
                것의 집계이며, 아래 연구 질문 빌더의 재료가 됩니다.
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs font-semibold text-muted">라벨</span>
                <button type="button" className={chip(filter.color === 'all')} onClick={() => setFilter((f) => ({ ...f, color: 'all' }))}>
                  전체
                </button>
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={chip(filter.color === c.value)}
                    onClick={() => setFilter((f) => ({ ...f, color: c.value as HighlightColor }))}
                  >
                    {c.meaning}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs font-semibold text-muted">인용 목적</span>
                <button type="button" className={chip(filter.use === 'all')} onClick={() => setFilter((f) => ({ ...f, use: 'all' }))}>
                  전체
                </button>
                {CITATION_USE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={chip(filter.use === o.value)}
                    onClick={() => setFilter((f) => ({ ...f, use: o.value as CitationUse }))}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted">{items.length}건 · 논문 {paperGroups.length}편</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded bg-action px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={items.length === 0}
                  onClick={() => {
                    downloadMarkdown(`${safeFilename('라이브러리 취합')}.md`, buildAggregateMarkdown(items, filter));
                    requestSurveyPrompt('export');
                  }}
                >
                  <Download size={13} /> Markdown 내보내기
                </button>
              </div>
              {paperGroups.length === 0 ? (
                <p className="rounded border border-line bg-white p-4 text-sm text-muted">
                  조건에 맞는 항목이 없습니다. 논문을 읽으며 하이라이트에 라벨과 인용 목적을
                  남기면 여기에 모입니다.
                </p>
              ) : (
                paperGroups.map((group) => (
                  <section key={group[0].paperId} className="rounded border border-line bg-white p-3">
                    <h3 className="mb-2 text-base font-semibold text-ink">
                      {group[0].paperTitle}
                      {group[0].paperAuthors && (
                        <span className="ml-2 text-sm font-normal text-muted">{group[0].paperAuthors}</span>
                      )}
                    </h3>
                    <ul className="space-y-2">
                      {group.map((item, index) => {
                        const style = highlightStyle(item.color);
                        const use = CITATION_USE_OPTIONS.find((o) => o.value === item.citationUse);
                        return (
                          <li key={`${item.paperId}-${item.source}-${index}`} className={`rounded p-2 text-base ${style.listClass}`}>
                            <span className="mb-1 flex flex-wrap items-center gap-1">
                              <span className="inline-flex rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold text-muted">
                                {style.meaning}
                              </span>
                              {use && (
                                <span className="inline-flex rounded bg-white/70 px-1.5 py-0.5 text-xs text-muted">
                                  {use.label}
                                  {item.citationSuggested ? ' (제안)' : ''}
                                </span>
                              )}
                              <button
                                type="button"
                                className="ml-auto inline-flex shrink-0 rounded border border-line bg-white/80 px-1.5 py-0.5 text-xs text-muted hover:border-action hover:text-action"
                                title={
                                  item.source === 'highlight'
                                    ? '해당 논문을 열고 원문의 하이라이트 위치로 이동합니다'
                                    : '해당 논문의 리뷰 노트를 엽니다 (수동 요약 항목)'
                                }
                                onClick={() => jumpToItem(item.paperId, item.itemId)}
                              >
                                노트에서 보기 →
                              </button>
                            </span>
                            “{item.text}”
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                여러 논문에서 취합된 키워드·관점·한계·비판을 재료로 연구 공백과 내 연구 질문을
                직접 잡습니다. 프레임과 질문은 도구가 제공하고, 답과 판단은 사용자가 채웁니다.
              </p>
              <section className="rounded border border-line bg-white p-3">
                <h3 className="mb-2 text-base font-semibold">취합 재료</h3>
                {materials.keywords.length > 0 && (
                  <p className="mb-2 text-sm text-muted">
                    <b className="text-ink">키워드({materials.keywords.length})</b>{' '}
                    {materials.keywords.slice(0, 15).join(' · ')}
                  </p>
                )}
                {([
                  ['관점(주장)', materials.perspectives],
                  ['한계', materials.limitations],
                  ['비판·질문', materials.critiques],
                ] as const).map(([label, list]) =>
                  list.length > 0 ? (
                    <details key={label} className="mb-1 text-sm text-muted">
                      <summary className="cursor-pointer font-semibold text-ink">
                        {label} {list.length}건
                      </summary>
                      <ul className="mt-1 space-y-1 pl-3">
                        {list.slice(0, 20).map((item, index) => (
                          <li key={`${label}-${index}`}>
                            “{item.text}”{' '}
                            <button
                              type="button"
                              className="text-muted underline decoration-dotted underline-offset-2 hover:text-action"
                              title="출처 논문의 해당 위치로 이동합니다 (공백 추적 역링크)"
                              onClick={() => jumpToItem(item.paperId, item.itemId)}
                            >
                              — {item.paperTitle}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null,
                )}
                {materials.keywords.length === 0
                  && materials.perspectives.length === 0
                  && materials.limitations.length === 0
                  && materials.critiques.length === 0 && (
                  <p className="text-sm text-muted">
                    아직 취합 재료가 없습니다. 재료 없이 빈 프레임으로 시작해도 됩니다.
                  </p>
                )}
              </section>
              <label className="block">
                <span className="mb-1 block text-base font-semibold text-ink">연구 공백 메모</span>
                <textarea
                  name="research-gap"
                  aria-label="연구 공백 메모"
                  title="반복되는 관점, 미해결 한계에서 발견한 공백을 적어보세요"
                  className="min-h-16 w-full resize-y rounded border border-line p-2 text-base outline-none focus:border-action"
                  placeholder="취합된 관점·한계·비판을 비교해, 아직 설명되지 않았거나 내 연구가 채울 수 있는 빈틈을 적어보세요."
                  value={doc.gapNote}
                  onChange={(e) => updateDoc((c) => ({ ...c, gapNote: e.target.value }))}
                />
              </label>
              <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="질문 프레임 선택">
                {RESEARCH_FRAMES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={f.id === frame.id}
                    title={f.tagline}
                    className={`rounded-full px-2.5 py-1 text-sm font-semibold ${
                      f.id === frame.id
                        ? 'bg-action text-white'
                        : 'border border-line text-muted hover:border-action hover:text-action'
                    }`}
                    onClick={() => updateDoc((c) => ({ ...c, frameId: f.id }))}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <ul className="space-y-3">
                {frame.slots.map((slot) => (
                  <li key={slot.key} className="rounded border border-line bg-white p-3">
                    <div className="mb-1 text-base font-semibold text-ink">{slot.label}</div>
                    <p className="mb-2 text-sm text-muted">{slot.helper}</p>
                    <textarea
                      name={`frame-${frame.id}-${slot.key}`}
                      aria-label={slot.label}
                      title={slot.label}
                      className="min-h-12 w-full resize-y rounded border border-line p-2 text-base outline-none focus:border-action"
                      placeholder={slot.placeholder}
                      value={frameAnswers[slot.key] ?? ''}
                      onChange={(e) => setSlotAnswer(slot.key, e.target.value)}
                    />
                  </li>
                ))}
              </ul>
              <section className="rounded border border-dashed border-line bg-white p-3">
                <button
                  type="button"
                  className="text-base font-semibold text-ink hover:text-action"
                  aria-expanded={expansionOpen}
                  onClick={() => setExpansionOpen((v) => !v)}
                >
                  질의 확장 질문 {expansionOpen ? '접기' : '펼치기'}
                </button>
                <p className="mt-1 text-sm text-muted">
                  질문 생성이 막힐 때 펼쳐 보세요. (FINER의 Interesting/Novel/Relevant 렌즈)
                </p>
                {expansionOpen && (
                  <ul className="mt-2 space-y-3">
                    {EXPANSION_QUESTIONS.map((q) => (
                      <li key={q.key}>
                        <div className="mb-1 text-sm font-semibold text-ink">{q.label}</div>
                        <textarea
                          name={`expansion-${q.key}`}
                          aria-label={q.label}
                          title={q.label}
                          className="min-h-12 w-full resize-y rounded border border-line p-2 text-base outline-none focus:border-action"
                          placeholder={q.placeholder}
                          value={doc.expansion[q.key] ?? ''}
                          onChange={(e) =>
                            updateDoc((c) => ({ ...c, expansion: { ...c.expansion, [q.key]: e.target.value } }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="flex items-center justify-end gap-2">
                {syncState !== 'idle' && (
                  <span
                    role="status"
                    className={`text-xs ${syncState === 'local' ? 'text-amber-700' : 'text-muted'}`}
                  >
                    {SYNC_LABEL[syncState]}
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded bg-action px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => {
                    downloadMarkdown(`${safeFilename('연구 질문 문서')}.md`, buildResearchMarkdown(doc));
                    requestSurveyPrompt('export');
                  }}
                >
                  <Download size={13} /> 연구 질문 문서 내보내기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
