import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { SUPABASE_AUTH_ENABLED } from '../constants';
import { supabase } from '../lib/supabase';

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!SUPABASE_AUTH_ENABLED);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    authEnabled: SUPABASE_AUTH_ENABLED,
    authReady: ready,
    session,
    user: (session?.user ?? null) as User | null,
    accessToken: session?.access_token ?? null,
  };
}
