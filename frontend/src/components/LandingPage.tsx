import { BookOpen, FileText, Highlighter, Library } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { AuthControls } from './AuthControls';

interface LandingPageProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
}

const guideSteps = [
  {
    icon: <FileText size={18} />,
    title: '논문 등록',
    body: '로그인 후 샘플 PDF, PDF 업로드, DOI/URL 등록으로 개인 라이브러리를 시작합니다.',
  },
  {
    icon: <Highlighter size={18} />,
    title: '원문 읽기',
    body: '원문 패널에서 중요한 문장을 드래그해 목적별 색상으로 하이라이트합니다.',
  },
  {
    icon: <Library size={18} />,
    title: '리뷰 노트 작성',
    body: '문제, 방법, 결과, 한계, 핵심 이해를 채우고 Markdown 또는 PDF로 내보냅니다.',
  },
] as const;

export function LandingPage({ authEnabled, authReady, user }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
        <div className="space-y-8">
          <header className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded bg-action text-white">
              <FileText size={23} />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-none sm:text-3xl">PaperLens</h1>
              <p className="mt-1 text-sm text-muted">로그인 후 시작하는 개인 논문 리뷰 서비스</p>
            </div>
          </header>

          <section className="max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-action">
              <BookOpen size={14} />
              서비스 사용설명서
            </p>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
              논문을 등록하고, 원문과 리뷰 노트를 한 화면에서 정리하세요
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
              PaperLens는 논문 원문 읽기, 핵심 문장 하이라이트, 질문 정리, 리뷰 노트 작성을 한 흐름으로
              묶습니다. 저장되는 노트와 PDF 원본은 로그인한 개인 계정의 라이브러리에 연결됩니다.
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            {guideSteps.map((step) => (
              <article key={step.title} className="rounded border border-line bg-white p-4">
                <div className="mb-3 grid size-9 place-items-center rounded bg-action/10 text-action">
                  {step.icon}
                </div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{step.body}</p>
              </article>
            ))}
          </div>

          <div className="rounded border border-line bg-white p-4 text-xs leading-5 text-muted">
            <b className="mb-1 block text-ink">진입 조건</b>
            샘플 PDF와 논문 리뷰 작업 화면은 로그인 후 사용할 수 있습니다. 로그인 전에는 사용설명서와 계정
            인증만 제공해 개인 라이브러리 저장 범위를 명확히 합니다.
          </div>
        </div>

        <aside className="rounded border border-line bg-panel p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-action">계정 인증</p>
            <h2 className="mt-1 text-xl font-bold">로그인 후 서비스 시작</h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              인증이 완료되면 별도 버튼 없이 논문 리뷰 서비스 화면으로 이동합니다.
            </p>
          </div>
          <AuthControls enabled={authEnabled} ready={authReady} user={user} />
        </aside>
      </section>
    </main>
  );
}
