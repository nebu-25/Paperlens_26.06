// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

const createDemoSessionIdMock = vi.hoisted(() => vi.fn(() => 'demo-session-id'));
const readDemoSessionIdMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants')>();
  return {
    ...actual,
    DEMO_AUTH_ENABLED: true,
    DEMO_EMAIL: 'demo@example.com',
    DEMO_PASSWORD: 'demo-password',
  };
});

vi.mock('../lib/demoSession', () => ({
  createDemoSessionId: createDemoSessionIdMock,
  readDemoSessionId: readDemoSessionIdMock,
}));

vi.mock('./AuthControls', () => ({
  AuthControls: ({ user, onEnterService }: { user: User | null; onEnterService?: () => void }) => (
    <div>
      {user ? (
        <button type="button" onClick={onEnterService}>
          논문 리뷰 서비스로 이동
        </button>
      ) : (
        <button type="button">로그인</button>
      )}
    </div>
  ),
}));

const demoUser = { id: 'demo-user', email: 'demo@example.com' } as User;
const personalUser = { id: 'personal-user', email: 'reader@example.com' } as User;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  createDemoSessionIdMock.mockClear();
  readDemoSessionIdMock.mockReset();
  readDemoSessionIdMock.mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LandingPage demo start CTA', () => {
  it('데모 계정으로 이미 로그인된 상태에서는 데모 세션을 준비하고 확인 모달을 연다', () => {
    const onEnterService = vi.fn();

    render(
      <LandingPage
        authEnabled
        authReady
        user={demoUser}
        onEnterService={onEnterService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '무료로 시작' }));

    expect(readDemoSessionIdMock).toHaveBeenCalledTimes(1);
    expect(createDemoSessionIdMock).toHaveBeenCalledTimes(1);
    expect(onEnterService).not.toHaveBeenCalled();
    expect(screen.getByText('서비스 입장 준비 완료')).toBeTruthy();
  });

  it('개인 계정으로 로그인된 상태에서는 기존처럼 바로 서비스로 이동한다', () => {
    const onEnterService = vi.fn();

    render(
      <LandingPage
        authEnabled
        authReady
        user={personalUser}
        onEnterService={onEnterService}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '무료로 시작' }));

    expect(createDemoSessionIdMock).not.toHaveBeenCalled();
    expect(onEnterService).toHaveBeenCalledTimes(1);
  });

  it('모바일 메뉴에서 섹션 링크를 열고 닫는다', () => {
    render(
      <LandingPage
        authEnabled
        authReady
        user={null}
        onEnterService={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '메뉴 열기' }));

    const mobileNav = screen.getByRole('navigation', { name: '모바일 섹션 이동' });
    expect(mobileNav).toBeTruthy();
    fireEvent.click(within(mobileNav).getByRole('link', { name: '사용 방법' }));

    expect(screen.queryByRole('navigation', { name: '모바일 섹션 이동' })).toBeNull();
  });
});
