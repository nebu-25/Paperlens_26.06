import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { SUPABASE_AUTH_ENABLED } from '../constants';
import { readDemoSessionId } from '../lib/demoSession';
import { supabase } from '../lib/supabase';

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!SUPABASE_AUTH_ENABLED);
  const [demoSessionId, setDemoSessionId] = useState<string | null>(() => readDemoSessionId());

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const refreshDemoSession = () => setDemoSessionId(readDemoSessionId());

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
      refreshDemoSession();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      refreshDemoSession();
    });
    window.addEventListener('paperlens-demo-session-change', refreshDemoSession);

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
      window.removeEventListener('paperlens-demo-session-change', refreshDemoSession);
    };
  }, []);

  return {
    authEnabled: SUPABASE_AUTH_ENABLED,
    authReady: ready,
    session,
    user: (session?.user ?? null) as User | null,
    accessToken: session?.access_token ?? null,
    demoSessionId,
  };
}
