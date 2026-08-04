// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewStore } from '../../hooks/useReviewStore';
import type { Paper, ReviewNote } from '../../types';
import { SourcePanel } from './SourcePanel';
import { WorkspaceContext } from './WorkspaceContext';

const ocrPaper = vi.fn();
const applyOcrCandidate = vi.fn();
const dismissOcrCandidate = vi.fn();

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
    ocrCandidate: null,
    applyOcrCandidate,
    dismissOcrCandidate,
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
  applyOcrCandidate.mockClear();
  dismissOcrCandidate.mockClear();
});

describe('SourcePanel OCR action', () => {
  it('shows OCR retry whenever a PDF is connected and OCR is available', () => {
    renderSourcePanel();

    fireEvent.click(screen.getByRole('button', { name: 'OCR 비교 생성' }));

    expect(ocrPaper).toHaveBeenCalledTimes(1);
  });

  it('keeps OCR output separate until the user explicitly applies it', () => {
    renderSourcePanel({
      ocrCandidate: {
        paperId: 'paper-1',
        baseText: '기본 원문',
        text: 'OCR 후보 본문',
        pageCount: 1,
        processedPages: 1,
        canApply: true,
        reasons: [],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'OCR 비교' }));
    expect(screen.getByText('기본 추출 원문')).toBeTruthy();
    expect(screen.getByText('OCR 후보 본문')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'OCR 결과 적용' }));
    expect(applyOcrCandidate).toHaveBeenCalledTimes(1);
  });

  it('blocks applying an OCR candidate that fails structural checks', () => {
    renderSourcePanel({
      ocrCandidate: {
        paperId: 'paper-1',
        baseText: '기본 원문',
        text: '짧은 OCR 후보',
        pageCount: 9,
        processedPages: 1,
        canApply: false,
        reasons: ['전체 9페이지 중 1페이지만 OCR 처리되었습니다.'],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'OCR 비교' }));
    expect(screen.getByText('OCR 후보 자동 적용 차단')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OCR 결과 적용' })).toHaveProperty('disabled', true);
  });
});
