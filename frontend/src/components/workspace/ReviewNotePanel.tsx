import {
  Check,
  Download,
  FileText,
  Highlighter,
  Library,
  PencilLine,
  Plus,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { CITATION_USE_OPTIONS, HIGHLIGHT_COLORS } from '../../constants';
import { DEFAULT_EXPORT_OPTIONS } from '../../lib/export';
import type { ExportOptions } from '../../lib/export';
import { highlightStyle } from '../../lib/format';
import type { CitationUse, HighlightColor, ManualSummaryItem } from '../../types';
import { AiDraftButton } from '../AiDraftButton';
import { NoticeBanner } from '../NoticeBanner';
import { QuestionsCard } from '../QuestionsCard';
import { SectionCard } from '../SectionCard';
import { TagEditor } from '../TagEditor';
import { useWorkspace } from './WorkspaceContext';

const EXPORT_OPTION_LABELS: { key: keyof ExportOptions; label: string }[] = [
  { key: 'template', label: '수동 요약 템플릿' },
  { key: 'terms', label: '용어 사전' },
  { key: 'questions', label: '질문' },
  { key: 'highlights', label: '하이라이트' },
  { key: 'citationBoard', label: '인용 후보' },
];

export function ReviewNotePanel() {
  const {
    paper,
    note,
    mobilePanel,
    online,
    savedAt,
    pending,
    syncNotice,
    setSyncNotice,
    setTags,
    updatePaper,
    updateNote,
    aiEnabled,
    aiLoadingTermId,
    explainTerm,
    highlightFilter,
    setHighlightFilter,
    exportMarkdown,
    exportPdf,
  } = useWorkspace().store;

  const [manualSummaryDraft, setManualSummaryDraft] = useState('');
  const [manualSummaryColor, setManualSummaryColor] = useState<HighlightColor>('yellow');
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);

  const hasHighlightColor = (color: string) => note.highlights.some((h) => (h.color ?? 'yellow') === color);
  const hasCitationUse = (use: CitationUse) =>
    note.highlights.some((h) => h.citationUse === use)
    || note.manualSummaries.some((item) => item.citationUse === use);
  const citationItems = [
    ...note.highlights.filter((h) => h.citationUse).map((item) => ({ ...item, source: 'highlight' as const })),
    ...note.manualSummaries.filter((item) => item.citationUse).map((item) => ({ ...item, source: 'manual' as const })),
  ];
  const reviewRoadmap = [
    {
      label: '문제 파악',
      helper: '주장 또는 전제 인용으로 이 논문이 다루는 문제를 표시하세요.',
      done: hasHighlightColor('yellow') || hasCitationUse('premise'),
    },
    {
      label: '접근법 파악',
      helper: '방법론 하이라이트나 방법 참고 후보를 남기세요.',
      done: hasHighlightColor('green') || hasCitationUse('method'),
    },
    {
      label: '결과 확인',
      helper: '결과 또는 결과 비교 후보를 표시하세요.',
      done: hasHighlightColor('blue') || hasCitationUse('comparison'),
    },
    {
      label: '비판적 검토',
      helper: '한계, 반론, 후속 질문을 정리하세요.',
      done:
        hasHighlightColor('pink') ||
        hasCitationUse('counterargument') ||
        hasCitationUse('limitation') ||
        note.questions.length > 0,
    },
    {
      label: '정리',
      helper: '내 논문에서 사용할 후보 문장을 인용 후보 보드로 분류하세요.',
      done: citationItems.length > 0,
    },
  ];
  const visibleHighlights = note.highlights.filter(
    (h) => highlightFilter === 'all' || (h.color ?? 'yellow') === highlightFilter,
  );
  const reviewDoneCount = reviewRoadmap.filter((step) => step.done).length;
  const nextRoadmapStep = reviewRoadmap.find((step) => !step.done);
  const currentRoadmapStep = nextRoadmapStep ?? reviewRoadmap[reviewRoadmap.length - 1];
  const reviewProgressPercent = Math.round((reviewDoneCount / reviewRoadmap.length) * 100);

  const addManualSummary = () => {
    const text = manualSummaryDraft.trim();
    if (!text) return;
    const next: ManualSummaryItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9),
      text,
      color: manualSummaryColor,
    };
    updateNote('manualSummaries', [...note.manualSummaries, next]);
    setManualSummaryDraft('');
  };

  if (!paper) return null;

  return (
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
          <NoticeBanner
            notice={syncNotice}
            onClose={() => setSyncNotice(null)}
            closeLabel="동기화 알림 닫기"
          />
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

        <QuestionsCard
          questions={note.questions}
          onChange={(q) => updateNote('questions', q)}
        />

        <SectionCard title="수동 요약 템플릿" icon={<PencilLine size={16} />}>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded border border-line bg-white p-2 text-sm outline-none focus:border-action"
              value={manualSummaryColor}
              onChange={(e) => setManualSummaryColor(e.target.value as HighlightColor)}
            >
              {HIGHLIGHT_COLORS.map((color) => (
                <option key={color.value} value={color.value}>
                  {color.meaning}
                </option>
              ))}
            </select>
            <input
              className="min-w-0 flex-1 rounded border border-line p-2 text-sm outline-none focus:border-action"
              placeholder="PDF를 읽고 직접 정리한 내용을 추가하세요."
              value={manualSummaryDraft}
              onChange={(e) => setManualSummaryDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualSummary()}
            />
            <button
              type="button"
              className="flex shrink-0 items-center justify-center gap-1 rounded border border-line px-3 text-sm"
              onClick={addManualSummary}
            >
              <Plus size={14} /> 추가
            </button>
          </div>
          {note.manualSummaries.length === 0 ? (
            <p className="text-xs text-muted">
              문자 추출이 부족할 때 PDF 뷰어를 읽고 주장, 방법론, 결과, 한계/비판,
              질문/후속 확인 기준으로 직접 정리하세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {note.manualSummaries.map((item) => {
                const style = highlightStyle(item.color);
                return (
                  <li key={item.id} className={`rounded p-2 text-sm ${style.listClass}`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="mb-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                          {style.meaning}
                        </span>
                        <span className="block">“{item.text}”</span>
                      </span>
                      <button
                        className="shrink-0 text-muted hover:text-ink"
                        onClick={() =>
                          updateNote(
                            'manualSummaries',
                            note.manualSummaries.filter((x) => x.id !== item.id),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <select
                      className="rounded border border-line bg-white px-2 py-1 text-xs text-muted outline-none focus:border-action"
                      value={item.citationUse ?? ''}
                      title="인용 후보 보드에서 사용할 목적"
                      onChange={(e) =>
                        updateNote(
                          'manualSummaries',
                          note.manualSummaries.map((x) =>
                            x.id === item.id
                              ? {
                                  ...x,
                                  citationUse: e.target.value
                                    ? (e.target.value as CitationUse)
                                    : undefined,
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="">인용 목적</option>
                      {CITATION_USE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="하이라이트" icon={<Highlighter size={16} />}>
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
                        {style.label}
                      </span>
                      <span className="block">“{h.text}”</span>
                    </span>
                    <div className="flex shrink-0 items-start gap-2">
                      <select
                        className="max-w-32 rounded border border-line bg-white px-2 py-1 text-xs text-muted outline-none focus:border-action"
                        value={h.citationUse ?? ''}
                        title="인용 후보 보드에서 사용할 목적"
                        onChange={(e) =>
                          updateNote(
                            'highlights',
                            note.highlights.map((x) =>
                              x.id === h.id
                                ? {
                                    ...x,
                                    citationUse: e.target.value
                                      ? (e.target.value as CitationUse)
                                      : undefined,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">인용 목적</option>
                        {CITATION_USE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-muted hover:text-ink"
                        onClick={() =>
                          updateNote(
                            'highlights',
                            note.highlights.filter((x) => x.id !== h.id),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="인용 후보 보드" icon={<PencilLine size={16} />}>
          <div className="mb-3 rounded border border-line bg-paper p-3 text-xs leading-relaxed text-muted">
            <b className="mb-1 block text-ink">이용 방법</b>
            하이라이트나 수동 요약 템플릿 항목마다 인용 목적을 선택하면 이 보드에 자동으로
            분류됩니다. 하이라이트 라벨은 논문 안에서의 의미를, 인용 목적은 내 논문에서의
            사용 방식을 구분합니다.
            <b className="mb-1 mt-3 block text-ink">데이터 기준</b>
            같은 문장도 논문 안에서는 근거일 수 있고, 내 논문에서는 결과 비교나 반론으로
            사용할 수 있습니다. 이 보드는 후자의 작업용 분류만 모읍니다.
          </div>
          {citationItems.length === 0 ? (
            <p className="text-xs text-muted">
              아직 인용 후보로 분류한 항목이 없습니다. 하이라이트 또는 수동 요약 템플릿에서
              인용 목적을 선택하세요.
            </p>
          ) : (
            <div className="space-y-3">
              {CITATION_USE_OPTIONS.map((option) => {
                const items = citationItems.filter((h) => h.citationUse === option.value);
                if (items.length === 0) return null;
                return (
                  <section key={option.value} className="rounded border border-line bg-white p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-ink">{option.label}</h4>
                        <p className="text-xs leading-relaxed text-muted">{option.helper}</p>
                      </div>
                      <span className="shrink-0 rounded bg-paper px-2 py-0.5 text-xs text-muted">
                        {items.length}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {items.map((h) => {
                        const style = highlightStyle(h.color);
                        return (
                          <li key={`${h.source}-${h.id}`} className={`rounded p-2 text-sm ${style.listClass}`}>
                            <span className="mb-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                              {h.source === 'manual' ? '수동 요약' : style.label}
                            </span>
                            <span className="block">“{h.text}”</span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="용어 사전" icon={<Library size={16} />}>
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

        <SectionCard
          title="노트 내려받기"
          icon={<FileText size={16} />}
          action={
            <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
              {reviewDoneCount}/{reviewRoadmap.length} 단계
            </span>
          }
        >
          <div className="rounded bg-white text-sm">
            <p className="text-xs leading-relaxed text-muted">
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
          <div className="mt-4 rounded border border-line bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">내보내기 포함 항목</span>
              <button
                type="button"
                className="rounded border border-line px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
                onClick={() => setExportOptions(DEFAULT_EXPORT_OPTIONS)}
              >
                전체 포함
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPORT_OPTION_LABELS.map((option) => (
                <label
                  key={option.key}
                  className="flex items-center gap-2 rounded border border-line px-2 py-1.5 text-xs text-muted"
                >
                  <input
                    type="checkbox"
                    className="accent-action"
                    checked={exportOptions[option.key]}
                    onChange={(e) =>
                      setExportOptions((current) => ({
                        ...current,
                        [option.key]: e.target.checked,
                      }))
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => exportMarkdown(exportOptions)}
              disabled={reviewDoneCount === 0}
            >
              <Download size={15} /> Markdown
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => exportPdf(exportOptions)}
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
  );
}
