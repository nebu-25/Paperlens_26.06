import { BookOpen, Check, FileText, Highlighter, Library, Route, Search } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { DEMO_AUTH_ENABLED, DEMO_EMAIL, DEMO_PASSWORD } from '../constants';
import { AuthControls } from './AuthControls';

interface LandingPageProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  onEnterService: () => void;
}

const steps = [
  {
    icon: <FileText size={18} />,
    title: '등록',
    body: 'PDF, PDF 원문 URL, DOI로 논문 정보를 만들고 원문 추출 품질까지 확인합니다.',
  },
  {
    icon: <Route size={18} />,
    title: '목적 선택',
    body: '선행연구, 방법론, 비판적 검토처럼 읽는 목적에 맞춰 질문을 바꿉니다.',
  },
  {
    icon: <Highlighter size={18} />,
    title: '읽고 표시',
    body: '원문과 PDF를 보며 핵심 문장을 하이라이트하고 근거, 결과, 한계를 분리합니다.',
  },
  {
    icon: <Library size={18} />,
    title: '노트화',
    body: '리뷰 노트를 개인 라이브러리에 저장하고 Markdown 또는 PDF로 내보냅니다.',
  },
] as const;

const features = [
  'PDF 원문과 리뷰 노트를 한 화면에서 작성',
  '3단계 읽기 흐름과 목적별 질문 카드',
  'OCR 재시도와 추출 품질 진단',
  '논문별 하이라이트, 용어, 내보내기',
] as const;

export function LandingPage({ authEnabled, authReady, user, onEnterService }: LandingPageProps) {
  function focusLogin() {
    document.getElementById('paperlens-auth-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.getElementById('paperlens-auth-email')?.focus(), 300);
  }

  return (
    <main className="min-h-screen bg-[#f4f7f6] text-ink">
      <section className="bg-[#1c5d5f] text-white">
        <div className="mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_410px] lg:items-center lg:py-10">
          <div className="flex min-h-[560px] flex-col justify-between">
            <header className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded bg-white/12 text-white">
                <FileText size={23} />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-none sm:text-3xl">PaperLens</h1>
                <p className="mt-1 text-sm text-[#cae1e2]">논문 리뷰·정리 워크스페이스</p>
              </div>
            </header>

            <div className="max-w-3xl py-12 sm:py-16 lg:py-10">
              <p className="mb-5 inline-flex items-center gap-2 rounded border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#cae1e2]">
                <BookOpen size={14} />
                읽기는 당신의 몫으로
              </p>
              <h2 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                논문을 읽고,
                <br />
                리뷰 노트까지 한 흐름으로
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#d8eceb]">
                PaperLens는 PDF 원문, 하이라이트, 목적별 질문, 리뷰 노트를 한 화면에 묶습니다.
                읽기 주변부의 정리는 도구가 맡고, 판단과 해석은 사용자가 남깁니다.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center justify-center rounded bg-white px-5 py-3 text-sm font-semibold text-[#16325a] hover:bg-[#e4f0f1]"
                  onClick={user ? onEnterService : focusLogin}
                >
                  무료로 리뷰 노트 만들기
                </button>
                <a
                  className="inline-flex min-h-12 items-center justify-center rounded border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  href="#workflow"
                >
                  작동 방식 보기
                </a>
              </div>
              {DEMO_AUTH_ENABLED && !user && (
                <p className="mt-3 text-xs text-[#cae1e2]">
                  데모 계정이 미리 입력되어 있습니다. 로그인 버튼을 눌러 바로 체험할 수 있습니다.
                </p>
              )}
            </div>

            <div className="grid gap-2 text-sm text-[#e4f0f1] sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <Check size={15} className="text-[#8ed3bd]" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <aside
            id="paperlens-auth-panel"
            className="rounded border border-white/15 bg-white p-4 text-ink shadow-xl sm:p-5 lg:sticky lg:top-6"
          >
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-action">계정 인증</p>
              <h2 className="mt-1 text-xl font-bold">
                {user ? '서비스 입장 준비 완료' : DEMO_AUTH_ENABLED ? '데모 계정으로 시작' : '로그인 후 서비스 시작'}
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                {user
                  ? '계정 인증이 완료되었습니다. 저장된 논문과 리뷰 노트를 바로 이어서 확인할 수 있습니다.'
                  : DEMO_AUTH_ENABLED
                    ? '데모 계정 정보가 입력되어 있습니다. 로그인하면 샘플 PDF와 리뷰 노트 흐름을 확인할 수 있습니다.'
                    : '인증이 완료되면 논문 리뷰 서비스 화면으로 이동합니다.'}
              </p>
            </div>
            <AuthControls
              enabled={authEnabled}
              ready={authReady}
              user={user}
              initialEmail={DEMO_EMAIL}
              initialPassword={DEMO_PASSWORD}
              onEnterService={onEnterService}
            />
            {import.meta.env.DEV && !authEnabled && (
              <div className="mt-4 rounded border border-dashed border-line bg-paper p-3">
                <p className="text-xs leading-5 text-muted">
                  <b className="text-ink">개발 모드</b> — Supabase 로그인 설정 없이 로컬 사용자로
                  워크스페이스를 열 수 있습니다.
                </p>
                <button
                  type="button"
                  className="mt-2 w-full rounded border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-action hover:text-action"
                  onClick={onEnterService}
                >
                  개발 모드로 시작
                </button>
              </div>
            )}
          </aside>
        </div>
      </section>

      <section id="workflow" className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#1c5d5f]">
              <Search size={14} />
              workflow
            </p>
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">논문 하나를 리뷰 노트로 바꾸는 순서</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map((step, index) => (
            <article key={step.title} className="border-t-2 border-[#65b8a2] bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="grid size-9 place-items-center rounded bg-[#e4f0f1] text-[#1c5d5f]">
                  {step.icon}
                </div>
                <span className="text-xs font-semibold text-muted">STEP {index + 1}</span>
              </div>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted">{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
