// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthControls } from './AuthControls';

const signOutMock = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const clearLocalReviewCacheMock = vi.hoisted(() => vi.fn(async () => undefined));
const clearLegacyLocalReviewCacheMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: signOutMock,
    },
  },
}));

vi.mock('../lib/localReviewCache', () => ({
  clearLocalReviewCache: clearLocalReviewCacheMock,
  clearLegacyLocalReviewCache: clearLegacyLocalReviewCacheMock,
}));

const user = {
  id: 'user-1',
  email: 'demo@example.com',
} as User;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOutMock.mockClear();
  clearLocalReviewCacheMock.mockClear();
  clearLegacyLocalReviewCacheMock.mockClear();
  window.sessionStorage.clear();
});

describe('AuthControls sign-out survey callbacks', () => {
  it('queues the sign-out survey before auth sign-out after pending changes are saved', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const onBeforeSignOut = vi.fn(async () => true);
    const onSignOutStarted = vi.fn();
    const onSignOutComplete = vi.fn();

    render(
      <AuthControls
        enabled
        ready
        user={user}
        variant="compact"
        pendingChanges={1}
        onBeforeSignOut={onBeforeSignOut}
        onSignOutStarted={onSignOutStarted}
        onSignOutComplete={onSignOutComplete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(onBeforeSignOut).toHaveBeenCalledTimes(1);
    expect(onSignOutStarted).toHaveBeenCalledTimes(1);
    expect(onSignOutComplete).toHaveBeenCalledTimes(1);
    expect(onSignOutStarted.mock.invocationCallOrder[0]).toBeLessThan(
      signOutMock.mock.invocationCallOrder[0],
    );
  });

  it('does not queue the survey when save fails and the user keeps the session', async () => {
    vi.stubGlobal('confirm', vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false));
    const onBeforeSignOut = vi.fn(async () => false);
    const onSignOutStarted = vi.fn();
    const onSignOutComplete = vi.fn();

    render(
      <AuthControls
        enabled
        ready
        user={user}
        variant="compact"
        pendingChanges={1}
        onBeforeSignOut={onBeforeSignOut}
        onSignOutStarted={onSignOutStarted}
        onSignOutComplete={onSignOutComplete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(onBeforeSignOut).toHaveBeenCalledTimes(1));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(onSignOutStarted).not.toHaveBeenCalled();
    expect(onSignOutComplete).not.toHaveBeenCalled();
  });
});
