import { useState } from 'react';
import { AlertCircle, ArrowRight, LogIn, LogOut, UserCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthControlsProps {
  enabled: boolean;
  ready: boolean;
  user: User | null;
  variant?: 'panel' | 'compact';
  onEnterService?: () => void;
}

export function AuthControls({ enabled, ready, user, variant = 'panel', onEnterService }: AuthControlsProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!enabled) {
    if (variant === 'compact') {
      return (
        <span
          className="inline-flex size-8 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-800 sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:py-1 sm:text-[11px]"
          title="로그인 설정 전입니다. 배포 환경변수를 확인하세요."
          aria-label="인증 설정 필요"
        >
          <AlertCircle size={14} />
          <span className="hidden sm:inline">인증 설정 필요</span>
        </span>
      );
    }
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        로그인 설정 전입니다. 배포 환경변수 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 확인하세요.
      </div>
    );
  }

  if (!ready) {
    if (variant === 'compact') {
      return (
        <span
          className="inline-flex size-8 items-center justify-center rounded bg-paper text-muted sm:h-auto sm:w-auto sm:px-2 sm:py-1 sm:text-[11px]"
          title="인증 확인 중"
          aria-label="인증 확인 중"
        >
          <UserCircle size={14} />
          <span className="hidden sm:ml-1 sm:inline">인증 확인 중</span>
        </span>
      );
    }
    return <div className="rounded bg-paper px-3 py-2 text-xs text-muted">로그인 상태 확인 중</div>;
  }

  if (user) {
    if (variant === 'compact') {
      return (
        <div className="flex h-8 items-center gap-1 rounded border border-line bg-white px-1.5 text-xs text-muted sm:px-2 sm:py-1">
          <UserCircle size={14} className="text-action" />
          <span className="hidden max-w-28 truncate sm:inline" title={user.email ?? '사용자'}>
            {user.email ?? '사용자'}
          </span>
          <button
            type="button"
            className="rounded p-1 hover:bg-paper hover:text-action sm:ml-1 sm:p-0.5"
            title="로그아웃"
            aria-label="로그아웃"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut size={13} />
          </button>
        </div>
      );
    }
    return (
      <div className="rounded border border-line bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted">
            로그인됨 · <b className="text-ink">{user.email ?? '사용자'}</b>
          </span>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:border-action hover:text-action"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut size={13} />
            로그아웃
          </button>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-action/90"
          onClick={onEnterService}
        >
          논문 리뷰 서비스로 이동
          <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <span
        className="inline-flex size-8 items-center justify-center rounded border border-line bg-white text-muted sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:py-1 sm:text-xs"
        title="로그인이 필요합니다"
        aria-label="로그인이 필요합니다"
      >
        <LogIn size={14} />
        <span className="hidden sm:inline">로그인</span>
      </span>
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
          id="paperlens-auth-email"
          name="email"
          className="min-w-0 rounded border border-line px-3 py-2 text-sm outline-none focus:border-action"
          type="email"
          placeholder="이메일"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          id="paperlens-auth-password"
          name="password"
          className="min-w-0 rounded border border-line px-3 py-2 text-sm outline-none focus:border-action"
          type="password"
          placeholder="비밀번호"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
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
