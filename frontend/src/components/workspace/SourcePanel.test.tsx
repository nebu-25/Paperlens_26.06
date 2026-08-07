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

  it('shows extracted vector table cells separately from the source text', () => {
    renderSourcePanel({
      paper: basePaper({
        tableStructures: [
          {
            id: 'table-1-1',
            page: 1,
            bbox: [72, 140, 520, 260],
            rows: [['Condition', 'Score'], ['A', '0.92']],
          },
        ],
      }),
    });

    fireEvent.click(screen.getByText('추가 탐색 도구'));
    expect(screen.getByText('PDF 표 구조 1건')).toBeTruthy();
    expect(screen.getByText('Condition')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PDF p.1' })).toBeTruthy();
  });

  it('lists formula candidates as PDF review locations without changing source text', () => {
    renderSourcePanel({
      paper: basePaper({
        formulaCandidates: [
          {
            id: 'formula-6-1',
            page: 6,
            bbox: [72, 240, 310, 258],
            text: 'Kwj = kdf(KdID, SNj, dID, pID)',
            reason: 'standalone_assignment',
          },
        ],
      }),
    });

    fireEvent.click(screen.getByText('추가 탐색 도구'));
    expect(screen.getByText('PDF 수식 후보 1건')).toBeTruthy();
    expect(screen.getByText('Kwj = kdf(KdID, SNj, dID, pID)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PDF p.6' })).toBeTruthy();
    expect(screen.getByText('본문 텍스트')).toBeTruthy();
  });

  it('keeps PDF area notes in additional exploration instead of highlights', () => {
    renderSourcePanel({
      note: {
        ...baseStore().note,
        pdfAreaNotes: [
          {
            id: 'area-1',
            page: 3,
            rect: { x: 72, y: 120, width: 300, height: 180 },
            kind: 'table',
            memo: '표본 수와 제외 기준을 다시 확인한다.',
            color: 'blue',
          },
        ],
      },
    });

    fireEvent.click(screen.getByText('추가 탐색 도구'));
    expect(screen.getByText('PDF 영역 메모 1건')).toBeTruthy();
    expect(screen.getByDisplayValue('표본 수와 제외 기준을 다시 확인한다.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PDF p.3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PDF 영역 메모 삭제' }).textContent).toBe('메모 삭제');
  });
});
