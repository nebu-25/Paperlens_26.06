// @vitest-environment happy-dom
//
// NoticeBanner 접근성 동작 검증: 심각도별 role/aria-live, 색상에 의존하지 않는
// 스크린리더용 심각도 접두사, 닫기 버튼 라벨/동작.
// (jest-dom 매처 없이 표준 DOM 속성으로 단언한다.)
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotice } from '../types';
import { NoticeBanner } from './NoticeBanner';

afterEach(() => {
  // vitest globals 비활성이라 RTL 자동 cleanup이 동작하지 않아 직접 해제한다.
  cleanup();
  vi.restoreAllMocks();
});

function notice(overrides: Partial<AppNotice> = {}): AppNotice {
  return { tone: 'info', title: '제목', message: '메시지', ...overrides };
}

describe('NoticeBanner', () => {
  it('오류는 assertive alert로 알린다', () => {
    render(<NoticeBanner notice={notice({ tone: 'error', title: '실패' })} onClose={() => {}} />);
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
    expect(banner.textContent).toContain('실패');
  });

  it('경고도 긴급(alert/assertive)으로 통일한다', () => {
    render(<NoticeBanner notice={notice({ tone: 'warning' })} onClose={() => {}} />);
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });

  it('성공/안내는 공손한 status/polite로 알린다', () => {
    render(<NoticeBanner notice={notice({ tone: 'success' })} onClose={() => {}} />);
    const banner = screen.getByRole('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });

  it('색상에 의존하지 않도록 심각도 접두사를 노출한다', () => {
    render(<NoticeBanner notice={notice({ tone: 'error', title: '백엔드 연결 실패' })} onClose={() => {}} />);
    // 스크린리더는 "오류: 백엔드 연결 실패"로 읽는다.
    expect(screen.getByRole('alert').textContent).toContain('오류: 백엔드 연결 실패');
  });

  it('닫기 버튼이 라벨을 갖고 onClose를 호출한다', () => {
    const onClose = vi.fn();
    render(<NoticeBanner notice={notice()} onClose={onClose} closeLabel="동기화 알림 닫기" />);
    // 접근 가능한 이름으로 버튼을 찾는다(없으면 throw).
    fireEvent.click(screen.getByRole('button', { name: '동기화 알림 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('추가 액션(children)을 렌더한다', () => {
    render(
      <NoticeBanner notice={notice()} onClose={() => {}}>
        <button type="button">재시도</button>
      </NoticeBanner>,
    );
    expect(screen.getByRole('button', { name: '재시도' }).textContent).toBe('재시도');
  });
});
