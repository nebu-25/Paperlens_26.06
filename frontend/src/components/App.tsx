import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';
import { LandingPage } from './LandingPage';
import {
  canShowSurveyPrompt,
  markSurveyPromptShown,
  type SurveyPromptReason,
} from '../lib/surveyPrompt';

const SERVICE_ROUTE = 'service_home';

const ReviewWorkspace = lazy(() =>
  import('./ReviewWorkspace').then((module) => ({ default: module.ReviewWorkspace })),
);
const SurveyPrompt = lazy(() =>
  import('./SurveyPrompt').then((module) => ({ default: module.SurveyPrompt })),
);

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

function AppLoadingFallback() {
  return (
    <main className="flex h-screen items-center justify-center bg-paper text-ink">
      <p className="rounded border border-line bg-white px-4 py-3 text-sm text-muted" role="status">
        워크스페이스를 불러오는 중입니다.
      </p>
    </main>
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
    if (!canShowSurveyPrompt(reason)) return;
    markSurveyPromptShown(reason);
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
          <Suspense fallback={null}>
            <SurveyPrompt reason={surveyPromptReason} onClose={() => setSurveyPromptReason(null)} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<AppLoadingFallback />}>
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
      </Suspense>
      {surveyPromptReason && (
        <Suspense fallback={null}>
          <SurveyPrompt reason={surveyPromptReason} onClose={() => setSurveyPromptReason(null)} />
        </Suspense>
      )}
    </>
  );
}

export default App;
