import { describe, expect, it } from 'vitest';
import { buildMarkdown, buildPrintHtml, safeFilename } from './export';
import type { Paper, ReviewNote } from '../types';

const paper: Paper = {
  id: '1',
  title: 'Attention Is All You Need',
  authors: 'Vaswani et al.',
  link: 'https://arxiv.org/abs/1706.03762',
  text: 'body',
};

const baseNote: ReviewNote = {
  oneLineSummary: '',
  oneLineSource: 'user',
  summaryMode: 'section',
  tags: [],
  sectionSummaries: [],
  highlights: [],
  terms: [],
  questions: [],
  template: { q1: '', q2: '', q3: '', q4: '', q5: '' },
  memos: {},
};

describe('safeFilename', () => {
  it('keeps hangul and word chars, replaces the rest', () => {
    expect(safeFilename('논문/제목: v2*')).toBe('논문_제목_ v2_');
  });

  it('falls back when result is blank after trim', () => {
    expect(safeFilename('   ')).toBe('review-note');
  });

  it('truncates to 80 chars', () => {
    expect(safeFilename('a'.repeat(200)).length).toBe(80);
  });
});

describe('buildMarkdown', () => {
  it('includes title and metadata header', () => {
    const md = buildMarkdown(paper, baseNote);
    expect(md).toContain('# Attention Is All You Need');
    expect(md).toContain('- 저자: Vaswani et al.');
  });

  it('includes only sections with content (both summary modes preserved)', () => {
    const note: ReviewNote = {
      ...baseNote,
      oneLineSummary: 'one line',
      sectionSummaries: [
        { id: 'a', section: 'Intro', content: 'kept', source: 'user' },
        { id: 'b', section: 'Empty', content: '   ', source: 'user' },
      ],
      template: { q1: 'tmpl answer', q2: '', q3: '', q4: '', q5: '' },
    };
    const md = buildMarkdown(paper, note);
    expect(md).toContain('## 한 줄 요약');
    expect(md).toContain('### Intro');
    expect(md).toContain('kept');
    expect(md).not.toContain('### Empty');
    // 토글과 무관하게 작성된 템플릿도 포함
    expect(md).toContain('## 수동 요약 템플릿');
    expect(md).toContain('tmpl answer');
  });

  it('groups highlights by review label', () => {
    const note: ReviewNote = {
      ...baseNote,
      highlights: [
        { id: 'a', text: 'core sentence', color: 'yellow' },
        { id: 'b', text: 'method sentence', color: 'green' },
        { id: 'c', text: 'result sentence', color: 'blue' },
      ],
    };
    const md = buildMarkdown(paper, note);
    expect(md).toContain('### 핵심 (핵심 주장)');
    expect(md).toContain('### 방법 (방법론)');
    expect(md).toContain('### 결과 (결과)');
    expect(md.indexOf('core sentence')).toBeLessThan(md.indexOf('method sentence'));
  });
});

describe('buildPrintHtml', () => {
  it('escapes HTML in user content', () => {
    const note: ReviewNote = {
      ...baseNote,
      highlights: [{ id: 'h', text: '<script>alert(1)</script>' }],
    };
    const html = buildPrintHtml(paper, note);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('produces a full HTML document', () => {
    const html = buildPrintHtml(paper, baseNote);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Attention Is All You Need');
  });

  it('prints highlights with label headings and color classes', () => {
    const note: ReviewNote = {
      ...baseNote,
      highlights: [{ id: 'h', text: 'method sentence', color: 'green' }],
    };
    const html = buildPrintHtml(paper, note);
    expect(html).toContain('<h3>방법 (방법론)</h3>');
    expect(html).toContain('class="highlight-green"');
  });
});
