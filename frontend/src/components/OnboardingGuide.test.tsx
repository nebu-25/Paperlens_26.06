// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_STEPS } from '../constants';
import { OnboardingGuide } from './OnboardingGuide';

afterEach(() => {
  cleanup();
});

describe('OnboardingGuide stepper', () => {
  it('starts on the first step with the step counter', () => {
    render(<OnboardingGuide onClose={() => {}} />);
    expect(screen.getByText(`1 / ${ONBOARDING_STEPS.length} 단계`)).toBeTruthy();
    expect(screen.getByRole('heading', { name: `1. ${ONBOARDING_STEPS[0].label}` })).toBeTruthy();
    // 첫 단계에선 이전 버튼이 비활성.
    expect(screen.getByRole('button', { name: '이전' }).hasAttribute('disabled')).toBe(true);
  });

  it('advances to the last step and shows the finish button', () => {
    render(<OnboardingGuide onClose={() => {}} />);
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    }
    const last = ONBOARDING_STEPS.length;
    expect(screen.getByText(`${last} / ${last} 단계`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy();
  });

  it('closes via the finish button', () => {
    const onClose = vi.fn();
    render(<OnboardingGuide onClose={onClose} />);
    for (let i = 0; i < ONBOARDING_STEPS.length - 1; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    }
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the close button and the Escape key', () => {
    const onClose = vi.fn();
    render(<OnboardingGuide onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '가이드 닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
