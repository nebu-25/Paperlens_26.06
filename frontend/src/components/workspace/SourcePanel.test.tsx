// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewStore } from '../../hooks/useReviewStore';
import type { Paper, ReviewNote } from '../../types';
import { SourcePanel } from './SourcePanel';
import { WorkspaceContext } from './WorkspaceContext';

const ocrPaper = vi.fn();

function basePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 'paper-1',
    title: 'PDF 수식 논문',
    authors: '',
    link: '',
    text: '본문 텍스트',
    pdfUrl: '/api/papers/paper-1/pdf',
    extractionQuality: {
      score: 100,
      status: 'good',
      reasons: [],
      source: 'auto',
    },
    ...overrides,
  };
}

function baseStore(overrides: Partial<ReviewStore> = {}): ReviewStore {
  return {
    paper: basePaper(),
    note: {} as ReviewNote,
    mobilePanel: 'paper',
    uploading: false,
    fileInputRef: { current: null },
    attachTargetRef: { current: null },
    setUploadOpen: vi.fn(),
    bodyRef: { current: null },
    bodyNodes: '본문 텍스트',
    onTextMouseUp: vi.fn(),
    updatePaper: vi.fn(),
    ocrPaper,
    ocrRunning: false,
    ocrAvailable: true,
    updateNote: vi.fn(),
    setSyncNotice: vi.fn(),
    highlightColor: 'claim',
    setHighlightColor: vi.fn(),
    addPdfHighlight: vi.fn(),
    addTermText: vi.fn(),
    signalScanEnabled: false,
    setSignalScanEnabled: vi.fn(),
    signalScanBlocked: false,
    signalMatches: [],
    signalCounts: {},
    keywordCandidates: [],
    figureCaptions: [],
    figureMentionCounts: new Map(),
    jumpToTextOffset: vi.fn(),
    ...overrides,
  } as unknown as ReviewStore;
}

function renderSourcePanel(overrides: Partial<ReviewStore> = {}) {
  return render(
    <WorkspaceContext.Provider
      value={{
        store: baseStore(overrides),
        accessToken: 'token',
        demoSessionId: null,
        requestSurveyPrompt: () => {},
      }}
    >
      <SourcePanel />
    </WorkspaceContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  ocrPaper.mockClear();
});

describe('SourcePanel OCR action', () => {
  it('shows OCR retry whenever a PDF is connected and OCR is available', () => {
    renderSourcePanel();

    fireEvent.click(screen.getByRole('button', { name: 'OCR 재시도' }));

    expect(ocrPaper).toHaveBeenCalledTimes(1);
  });
});
