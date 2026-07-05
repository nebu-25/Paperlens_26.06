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
import { UploadBar } from './workspace/UploadBar';
import { WorkspaceContext } from './workspace/WorkspaceContext';
import { WorkspaceHeader } from './workspace/WorkspaceHeader';

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
}

function ReviewWorkspace({ authEnabled, authReady, user, accessToken }: ReviewWorkspaceProps) {
  const store = useReviewStore({ accessToken, authReady, authEnabled, userId: user?.id ?? null });
  const { paper, mobilePanel, setMobilePanel, setSelection } = store;

  return (
    <WorkspaceContext.Provider value={{ store, accessToken }}>
      <main
        className="flex h-screen flex-col overflow-hidden bg-paper text-ink"
        onMouseDown={() => setSelection(null)}
      >
        <WorkspaceHeader authEnabled={authEnabled} authReady={authReady} user={user} />
        <UploadBar />

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          {/* ── 사이드바 ── */}
          <PaperSidebar />

          {/* ── 본문 ── */}
          {!paper ? (
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
              <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
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

function App() {
  const { authEnabled, authReady, user, accessToken } = useAuthSession();
  const { route, navigate } = useAppRoute();
  const initialAuthResolvedRef = useRef(false);
  const previousAccessTokenRef = useRef<string | null>(null);

  // 개발용 우회: Vite dev 서버 + Supabase 미설정일 때만 로그인 없이 워크스페이스 진입을 허용한다.
  // 백엔드도 동일 조건에서 'local' 단일 사용자로 동작하며, 프로덕션 빌드(DEV=false)에는 영향이 없다.
  const devLocalMode = import.meta.env.DEV && !authEnabled;

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
    }
  }, [accessToken, authReady, navigate, route]);

  if (route === 'landing' || (!accessToken && !devLocalMode)) {
    return (
      <LandingPage
        authEnabled={authEnabled}
        authReady={authReady}
        user={user}
        onEnterService={() => navigate('service')}
      />
    );
  }

  return (
    <ReviewWorkspace
      authEnabled={authEnabled}
      authReady={authReady}
      user={user}
      accessToken={accessToken ?? ''}
    />
  );
}

export default App;
