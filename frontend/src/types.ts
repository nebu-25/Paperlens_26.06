// PaperLens 도메인 타입 모음.

export type Source = 'user' | 'ai_draft';

// 백엔드가 원문에서 추정한 섹션 헤딩(#6). canonical은 정규화 카테고리(없으면 빈 문자열).
export interface DetectedSection {
  title: string;
  canonical?: string;
  start?: number;
}

export interface Paper {
  id: string;
  title: string;
  authors: string;
  link: string;
  doi?: string;
  sourceKey?: string;
  suggestedTags?: string[];
  metadataSource?: string;
  metadataConfidence?: string;
  metadataWarnings?: string[];
  pdfUrl?: string;
  pdfFilename?: string;
  sections?: DetectedSection[];
  text: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
export type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'metadata' | 'creating';
export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

export interface AppNotice {
  tone: NoticeTone;
  title: string;
  message: string;
}

export interface Highlight {
  id: string;
  text: string;
  color?: HighlightColor;
  // 원문(paper.text) 내 문자 오프셋. 옛 데이터 호환을 위해 선택적.
  start?: number;
  end?: number;
}

export interface Term {
  id: string;
  term: string;
  explanation: string;
  addedByUser: boolean;
  aiExplained: boolean;
}

export interface Question {
  id: string;
  text: string;
}

export interface SectionSummary {
  id: string;
  section: string;
  content: string;
  source: Source;
}

// 요약 방식: 섹션별 요약(구조형) ↔ 5문항 템플릿(분석형) 중 사용자가 택1
export type SummaryMode = 'section' | 'template';

export interface ReviewNote {
  oneLineSummary: string;
  oneLineSource: Source;
  summaryMode: SummaryMode;
  tags: string[];
  sectionSummaries: SectionSummary[];
  highlights: Highlight[];
  terms: Term[];
  questions: Question[];
  template: {
    q1: string; // 무엇을 해결하려 하는가
    q2: string; // 어떤 방법
    q3: string; // 결과
    q4: string; // 한계
    q5: string; // 내가 이해한 핵심
  };
  memos: Record<string, string>; // 섹션별 메모 카드
}
