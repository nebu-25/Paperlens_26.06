import React from 'react';
import ReactDOM from 'react-dom/client';
import { FileText, Highlighter, Library, PencilLine } from 'lucide-react';
import './styles.css';

function App() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-0 lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-line bg-panel p-6 lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded bg-action text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">PaperLens</h1>
              <p className="text-sm text-muted">사용자 주도 논문 리뷰 노트</p>
            </div>
          </div>

          <div className="rounded border border-dashed border-line bg-paper p-5">
            <p className="mb-3 text-sm font-medium">새 논문 등록</p>
            <button className="w-full rounded bg-action px-4 py-3 text-sm font-semibold text-white">
              PDF 업로드
            </button>
            <input
              className="mt-3 w-full rounded border border-line bg-white px-3 py-2 text-sm outline-none focus:border-action"
              placeholder="DOI 또는 URL"
            />
          </div>

          <div className="mt-6 space-y-3">
            {['작성중', '검토 필요', '완성'].map((status) => (
              <button
                className="flex w-full items-center justify-between rounded border border-line bg-white px-3 py-3 text-left text-sm"
                key={status}
              >
                <span>샘플 리뷰 노트</span>
                <span className="rounded bg-paper px-2 py-1 text-xs text-muted">{status}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
          <article className="border-b border-line bg-white p-6 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">원문 패널</h2>
              <span className="rounded bg-paper px-2 py-1 text-xs text-muted">AI 없이 동작</span>
            </div>
            <div className="space-y-4 text-sm leading-7 text-neutral-800">
              <p>
                Abstract. This study explores retrieval augmented reading workflows for
                research papers. Users select important sentences, record questions, and
                write section notes in their own words.
              </p>
              <p>
                <span className="border-b border-dotted border-action">Transformer</span>{' '}
                기반 모델은 긴 문서를 다룰 때 출처 확인과 사용자 검증이 중요하다.
                PaperLens는 자동 요약보다 직접 작성 흐름을 우선한다.
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button className="inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                <Highlighter size={16} />
                하이라이트
              </button>
              <button className="inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                <Library size={16} />
                용어 추가
              </button>
            </div>
          </article>

          <article className="bg-paper p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">리뷰 노트</h2>
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                자동 저장 준비
              </span>
            </div>

            <div className="space-y-4">
              <NoteField title="한 줄 요약" placeholder="이 논문을 내 언어로 한 문장으로 정리하세요." />
              <NoteField title="읽으며 생긴 질문" placeholder="논문을 읽으며 생긴 질문을 기록하세요." />
              <NoteField title="내가 이해한 핵심" placeholder="핵심 주장, 방법, 한계, 후속 아이디어를 적으세요." />

              <section className="rounded border border-line bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <PencilLine size={16} />
                  <h3 className="text-sm font-semibold">섹션별 메모 카드</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {['Abstract', 'Introduction', 'Method', 'Result'].map((section) => (
                    <textarea
                      className="min-h-24 resize-none rounded border border-line p-3 text-sm outline-none focus:border-action"
                      key={section}
                      placeholder={`${section} 메모`}
                    />
                  ))}
                </div>
              </section>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function NoteField({ title, placeholder }: { title: string; placeholder: string }) {
  return (
    <section className="rounded border border-line bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button className="rounded border border-line px-2 py-1 text-xs text-muted" disabled>
          AI 초안 준비 중
        </button>
      </div>
      <textarea
        className="min-h-24 w-full resize-none rounded border border-line p-3 text-sm outline-none focus:border-action"
        placeholder={placeholder}
      />
    </section>
  );
}

export default App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

