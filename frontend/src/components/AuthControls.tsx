import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthControlsProps {
  enabled: boolean;
  ready: boolean;
  user: User | null;
}

export function AuthControls({ enabled, ready, user }: AuthControlsProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!enabled) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        로그인 설정 전입니다. 배포 환경변수 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 확인하세요.
      </div>
    );
  }

  if (!ready) {
    return <div className="rounded bg-paper px-3 py-2 text-xs text-muted">로그인 상태 확인 중</div>;
  }

  if (user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-white px-3 py-2">
        <span className="min-w-0 truncate text-xs text-muted">
          로그인됨 · <b className="text-ink">{user.email ?? '사용자'}</b>
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
          onClick={() => void supabase?.auth.signOut()}
        >
          <LogOut size={13} />
          로그아웃
        </button>
      </div>
    );
  }

  async function submit() {
    if (!supabase || !email.trim() || !password) return;
    setBusy(true);
    setMessage('');
    const credentials = { email: email.trim(), password };
    const { error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    if (error) setMessage(error.message);
    else if (mode === 'sign-up') setMessage('가입 확인 메일이 발송되었거나 계정이 생성되었습니다.');
    setBusy(false);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-line bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">개인 계정</span>
        <button
          type="button"
          className="text-xs text-muted hover:text-action"
          onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        >
          {mode === 'sign-in' ? '회원가입' : '로그인'}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          className="min-w-0 rounded border border-line px-3 py-2 text-sm outline-none focus:border-action"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="min-w-0 rounded border border-line px-3 py-2 text-sm outline-none focus:border-action"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1 rounded bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={busy || !email.trim() || !password}
          onClick={() => void submit()}
        >
          <LogIn size={14} />
          {mode === 'sign-in' ? '로그인' : '가입'}
        </button>
      </div>
      <button
        type="button"
        className="mt-2 w-full rounded border border-line px-3 py-2 text-sm text-muted hover:border-action hover:text-action disabled:opacity-60"
        disabled={busy}
        onClick={() => void signInWithGoogle()}
      >
        Google로 계속하기
      </button>
      {message && <p className="mt-2 text-xs text-amber-700">{message}</p>}
    </div>
  );
}
