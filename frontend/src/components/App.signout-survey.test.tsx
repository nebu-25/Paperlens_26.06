// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: Session | null) => void;
const LAZY_WORKSPACE_TIMEOUT_MS = 5000;

const authState = vi.hoisted(() => ({
  session: null as Session | null,
  callback: null as AuthCallback | null,
}));

const fakeSession = {
  access_token: 'token-abc',
  user: { id: 'user-1', email: 'demo@example.com' },
} as unknown as Session;

const signOutMock = vi.hoisted(() =>
  vi.fn(async () => {
    // Faithful to Supabase: signing out fires the auth listener with a null session.
    authState.session = null;
    authState.callback?.('SIGNED_OUT', null);
    return { error: null };
  }),
);

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: authState.session } })),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        authState.callback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: signOutMock,
    },
  },
}));

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants')>();
  return { ...actual, SUPABASE_AUTH_ENABLED: true };
});

vi.mock('../lib/localReviewCache', () => ({
  clearLocalReviewCache: vi.fn(async () => undefined),
  clearLegacyLocalReviewCache: vi.fn(),
}));

vi.mock('../lib/demoSession', () => ({
  readDemoSessionId: vi.fn(() => null),
  createDemoSessionId: vi.fn(),
  clearDemoSessionId: vi.fn(),
}));

const saveNowMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('../hooks/useReviewStore', () => ({
  useReviewStore: () => ({
    paper: null,
    mobilePanel: 'paper',
    setMobilePanel: vi.fn(),
    setSelection: vi.fn(),
    sidebarCollapsed: false,
    loaded: true,
    savedAt: '저장됨 12:00',
    restorePhase: 'ready',
    restoreElapsedSeconds: 0,
    aiEnabled: false,
    pending: 1,
    syncing: false,
    saveNow: saveNowMock,
  }),
}));

// Heavy workspace children are irrelevant to the survey wiring.
vi.mock('./workspace/PaperSidebar', () => ({ PaperSidebar: () => null }));
vi.mock('./workspace/SourcePanel', () => ({ SourcePanel: () => null }));
vi.mock('./workspace/ReviewNotePanel', () => ({ ReviewNotePanel: () => null }));
vi.mock('./workspace/UploadBar', () => ({ UploadBar: () => null }));
vi.mock('./workspace/SelectionToolbar', () => ({ SelectionToolbar: () => null }));
vi.mock('./EmptyState', () => ({ EmptyState: () => null }));
vi.mock('./LandingPage', () => ({ LandingPage: () => null }));

import App from './App';

beforeEach(() => {
  authState.session = fakeSession;
  authState.callback = null;
  window.history.replaceState(null, '', '/service_home');
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => true));
  saveNowMock.mockClear();
  signOutMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-out survey prompt after pending save', () => {
  it('shows the survey modal after saving pending changes and signing out', async () => {
    render(<App />);

    const signOutButton = await screen.findByRole(
      'button',
      { name: '로그아웃' },
      { timeout: LAZY_WORKSPACE_TIMEOUT_MS },
    );
    fireEvent.click(signOutButton);

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(saveNowMock).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.getByText('나가기 전에 1분만 알려주세요')).toBeTruthy(),
    );
  });

  it('shows the sign-out survey even after an export survey was already shown this session', async () => {
    // Simulate the user having exported earlier this session (export survey shown+dismissed).
    window.sessionStorage.setItem('paperlens:demo-survey:shown-this-session', 'true');

    render(<App />);

    const signOutButton = await screen.findByRole(
      'button',
      { name: '로그아웃' },
      { timeout: LAZY_WORKSPACE_TIMEOUT_MS },
    );
    fireEvent.click(signOutButton);

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(screen.getByText('나가기 전에 1분만 알려주세요')).toBeTruthy(),
    );
  });

  it('shows the sign-out survey even if a previous sign-out survey key exists', async () => {
    window.sessionStorage.setItem('paperlens:demo-survey:signout-shown-this-session', 'true');

    render(<App />);

    const signOutButton = await screen.findByRole(
      'button',
      { name: '로그아웃' },
      { timeout: LAZY_WORKSPACE_TIMEOUT_MS },
    );
    fireEvent.click(signOutButton);

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(screen.getByText('나가기 전에 1분만 알려주세요')).toBeTruthy(),
    );
  });
});
