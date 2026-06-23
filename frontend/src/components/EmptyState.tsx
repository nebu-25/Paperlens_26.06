import { FileText } from 'lucide-react';

export function EmptyState() {
  return (
    <section className="min-h-0 overflow-y-auto bg-white/50 p-6 sm:p-10">
      <div className="mx-auto grid min-h-full max-w-5xl place-items-center">
        <div className="grid w-full gap-8 rounded border border-line bg-panel/90 p-8 shadow-sm md:grid-cols-[1fr_240px] md:items-center">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-action">
              PaperLens 시작하기
            </p>
            <h2 className="mb-3 text-2xl font-bold leading-tight sm:text-3xl">
              논문을 등록하면 원문과 리뷰 노트가 나란히 열립니다
            </h2>
            <p className="max-w-xl text-sm leading-6 text-muted">
              상단의 PDF 업로드 또는 DOI/URL 입력으로 논문을 추가하세요. 등록 전에는 이 화면에서
              흐름을 확인하고, 등록 후에는 원문과 리뷰를 독립적으로 스크롤하며 작성할 수 있습니다.
            </p>
            <div className="mt-5 grid gap-2 text-sm text-ink sm:grid-cols-3">
              <div className="rounded border border-line bg-paper px-3 py-2">1. 논문 등록</div>
              <div className="rounded border border-line bg-paper px-3 py-2">2. 문장 하이라이트</div>
              <div className="rounded border border-line bg-paper px-3 py-2">3. 리뷰 노트 작성</div>
            </div>
          </div>
          <div className="mx-auto grid size-44 place-items-center rounded-full bg-action/10 text-action">
            <div className="grid size-32 place-items-center rounded-full bg-white shadow-sm">
              <FileText size={54} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
