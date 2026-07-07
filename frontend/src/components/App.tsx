import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useReviewStore } from '../hooks/useReviewStore';
import { useAuthSession } from '../hooks/useAuthSession';
import { EmptyState } from './EmptyState';
import { LandingPage } from './LandingPage';
import { PaperSidebar } from './workspace/PaperSidebar';
import { ReviewNotePanel } from './workspace/ReviewNotePanel';
import { SelectionToolbar } from './workspace/SelectionToolbar';
import { SourcePanel } from './workspace/SourcePanel';
import { SurveyPrompt } from './SurveyPrompt';
import { UploadBar } from './workspace/UploadBar';
import { WorkspaceContext } from './workspace/WorkspaceContext';
import { WorkspaceHeader } from './workspace/WorkspaceHeader';
import {
  canShowSurveyPrompt,
  markSurveyPromptShown,
  type SurveyPromptReason,
} from '../lib/surveyPrompt';

const SERVICE_ROUTE = 'service_home';

type AppRoute = 'landing' | 'service';

function appBasePath() {
  return (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
}

function pathForRoute(route: AppRoute) {
  const base = appBasePath();
  if (route === 'service') return base ? `${base}/${SERVICE_ROUTE}` : `/${SERVICE_ROUTE}`;
  return base ? `${base}/` : '/';
}

function routeFromLocation(): AppRoute {
  const base = appBasePath();
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  const normalized = path.replace(/^\/+|\/+$/g, '');
  return normalized === SERVICE_ROUTE ? 'service' : 'landing';
}

function writeRoute(route: AppRoute, mode: 'push' | 'replace' = 'replace') {
  const nextPath = pathForRoute(route);
  if (window.location.pathname !== nextPath) {
    if (mode === 'push') window.history.pushState(null, '', nextPath);
    else window.history.replaceState(null, '', nextPath);
  }
}

function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromLocation());

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((next: AppRoute, mode: 'push' | 'replace' = 'push') => {
    writeRoute(next, mode);
    setRoute(next);
  }, []);

  return { route, navigate };
}

interface ReviewWorkspaceProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  accessToken: string;
  demoSessionId: string | null;
  requestSurveyPrompt: (reason: SurveyPromptReason) => void;
  onSignOutStarted: () => void;
  onSignOutComplete: () => void;
}

function ReviewWorkspace({
  authEnabled,
  authReady,
  user,
  accessToken,
  demoSessionId,
  requestSurveyPrompt,
  onSignOutStarted,
  onSignOutComplete,
}: ReviewWorkspaceProps) {
  const store = useReviewStore({
    accessToken,
    authReady,
    authEnabled,
    userId: user?.id ?? null,
    demoSessionId,
  });
  const { paper, mobilePanel, setMobilePanel, setSelection, sidebarCollapsed, loaded, savedAt } = store;

  return (
    <WorkspaceContext.Provider value={{ store, accessToken, demoSessionId, requestSurveyPrompt }}>
      <main
        className="flex h-screen flex-col overflow-hidden bg-paper text-ink"
        onMouseDown={() => setSelection(null)}
      >
        <WorkspaceHeader
          authEnabled={authEnabled}
          authReady={authReady}
          user={user}
          onSignOutStarted={onSignOutStarted}
          onSignOutComplete={onSignOutComplete}
        />
        <UploadBar />

        <div
          className={`grid min-h-0 flex-1 grid-cols-1 ${
            sidebarCollapsed ? 'lg:grid-cols-[2.75rem_1fr]' : 'lg:grid-cols-[264px_1fr]'
          }`}
        >
          {/* ── 사이드바(내 리뷰 노트) — 접으면 얇은 레일로 축소해 본문을 넓힌다 ── */}
          <PaperSidebar />

          {/* ── 본문 ── */}
          {!paper && !loaded ? (
            <WorkspaceLoadingState demoSessionId={demoSessionId} savedAt={savedAt} />
          ) : !paper ? (
            <EmptyState />
          ) : (
            <section className="flex min-h-0 flex-col">
              <div className="flex shrink-0 border-b border-line bg-panel p-2 xl:hidden">
                <button
                  type="button"
                  className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${
                    mobilePanel === 'paper' ? 'bg-action text-white' : 'text-muted'
                  }`}
                  onClick={() => setMobilePanel('paper')}
                >
                  논문
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${
                    mobilePanel === 'review' ? 'bg-action text-white' : 'text-muted'
                  }`}
                  onClick={() => setMobilePanel('review')}
                >
                  리뷰
                </button>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.8fr)]">
                <SourcePanel />
                <ReviewNotePanel />
              </div>
            </section>
          )}
        </div>

        {/* 드래그 선택 플로팅 툴바 */}
        <SelectionToolbar />
      </main>
    </WorkspaceContext.Provider>
  );
}

function WorkspaceLoadingState({
  demoSessionId,
  savedAt,
}: {
  demoSessionId: string | null;
  savedAt: string | null;
}) {
  const eyebrow = demoSessionId ? '데모 문서 준비 중' : '리뷰 노트 불러오는 중';
  const title = demoSessionId ? '빠른 테스트 문서를 여는 중입니다' : '저장된 작업을 확인하고 있습니다';
  const status = savedAt || '서버와 로컬 캐시를 확인하고 있습니다.';

  return (
    <section className="flex min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.8fr)]">
        <article className="flex min-h-0 flex-col border-b border-line bg-white xl:border-b-0 xl:border-r">
          <div className="shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-action">
                  {eyebrow}
                </p>
                <h2 className="text-base font-semibold">원문 패널</h2>
              </div>
              <div className="size-9 shrink-0 animate-pulse rounded bg-action/15" aria-hidden="true" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="mb-5 max-w-2xl">
              <h3 className="text-xl font-bold leading-tight">{title}</h3>
              <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-muted">
                {status}
              </p>
            </div>
            <div className="space-y-4" aria-hidden="true">
              <div className="h-5 w-3/4 animate-pulse rounded bg-paper" />
              <div className="h-4 w-11/12 animate-pulse rounded bg-paper" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-paper" />
              <div className="mt-8 grid gap-3">
                <div className="h-24 animate-pulse rounded border border-line bg-panel" />
                <div className="h-24 animate-pulse rounded border border-line bg-panel" />
                <div className="h-24 animate-pulse rounded border border-line bg-panel" />
              </div>
            </div>
          </div>
        </article>

        <article className="flex min-h-0 flex-col bg-paper">
          <div className="shrink-0 border-b border-line bg-paper/95 p-5 pb-3 sm:p-6 sm:pb-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">리뷰 노트</h2>
              <div className="h-7 w-28 animate-pulse rounded bg-white" aria-hidden="true" />
            </div>
            <div className="mt-3 rounded border border-line bg-white p-2" aria-hidden="true">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="h-3 w-20 animate-pulse rounded bg-paper" />
                <div className="h-3 w-28 animate-pulse rounded bg-paper" />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-paper">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-action/30" />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-5 sm:px-6">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded border border-line bg-white p-4" aria-hidden="true">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-paper" />
                  <div className="h-5 w-16 animate-pulse rounded bg-paper" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-paper" />
                  <div className="h-3 w-10/12 animate-pulse rounded bg-paper" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-paper" />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function App() {
  const { authEnabled, authReady, user, accessToken, demoSessionId } = useAuthSession();
  const { route, navigate } = useAppRoute();
  const [surveyPromptReason, setSurveyPromptReason] = useState<SurveyPromptReason | null>(null);
  const initialAuthResolvedRef = useRef(false);
  const previousAccessTokenRef = useRef<string | null>(null);
  const signOutSurveyPendingRef = useRef(false);

  // 개발용 우회: Vite dev 서버 + Supabase 미설정일 때만 로그인 없이 워크스페이스 진입을 허용한다.
  // 백엔드도 동일 조건에서 'local' 단일 사용자로 동작하며, 프로덕션 빌드(DEV=false)에는 영향이 없다.
  const devLocalMode = import.meta.env.DEV && !authEnabled;

  const requestSurveyPrompt = useCallback((reason: SurveyPromptReason) => {
    if (!canShowSurveyPrompt()) return;
    markSurveyPromptShown();
    setSurveyPromptReason(reason);
  }, []);

  const queueSignOutSurveyPrompt = useCallback(() => {
    signOutSurveyPendingRef.current = true;
  }, []);

  const showQueuedSignOutSurveyPrompt = useCallback(() => {
    if (!signOutSurveyPendingRef.current) return;
    signOutSurveyPendingRef.current = false;
    requestSurveyPrompt('sign-out');
  }, [requestSurveyPrompt]);

  useEffect(() => {
    if (!authReady) return;
    if (route === 'service' && !accessToken && !devLocalMode) {
      navigate('landing', 'replace');
    }
  }, [accessToken, authReady, devLocalMode, navigate, route]);

  useEffect(() => {
    if (!authReady) return;
    const previousAccessToken = previousAccessTokenRef.current;
    if (!initialAuthResolvedRef.current) {
      initialAuthResolvedRef.current = true;
      previousAccessTokenRef.current = accessToken;
      return;
    }
    previousAccessTokenRef.current = accessToken;
    if (!previousAccessToken && accessToken && route === 'landing') {
      navigate('service', 'push');
      return;
    }
    if (previousAccessToken && !accessToken) {
      showQueuedSignOutSurveyPrompt();
    }
  }, [accessToken, authReady, navigate, route, showQueuedSignOutSurveyPrompt]);

  if (route === 'landing' || (!accessToken && !devLocalMode)) {
    return (
      <>
        <LandingPage
          authEnabled={authEnabled}
          authReady={authReady}
          user={user}
          onEnterService={() => navigate('service')}
          onSignOutStarted={queueSignOutSurveyPrompt}
          onSignOutComplete={showQueuedSignOutSurveyPrompt}
        />
        {surveyPromptReason && (
          <SurveyPrompt reason={surveyPromptReason} onClose={() => setSurveyPromptReason(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <ReviewWorkspace
        authEnabled={authEnabled}
        authReady={authReady}
        user={user}
        accessToken={accessToken ?? ''}
        demoSessionId={demoSessionId}
        requestSurveyPrompt={requestSurveyPrompt}
        onSignOutStarted={queueSignOutSurveyPrompt}
        onSignOutComplete={showQueuedSignOutSurveyPrompt}
      />
      {surveyPromptReason && (
        <SurveyPrompt reason={surveyPromptReason} onClose={() => setSurveyPromptReason(null)} />
      )}
    </>
  );
}

export default App;
