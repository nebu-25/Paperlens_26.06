// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SectionCard } from './SectionCard';

afterEach(() => {
  cleanup();
});

describe('SectionCard', () => {
  it('toggles the body when the header is clicked', () => {
    render(
      <SectionCard title="탭 섹션" icon={<span aria-hidden="true">i</span>}>
        <p>접히는 내용</p>
      </SectionCard>,
    );

    const toggle = screen.getByRole('button', { name: '탭 섹션' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('접히는 내용')).toBeTruthy();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('접히는 내용')).toBeNull();
  });
});
