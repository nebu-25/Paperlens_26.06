// PaperLens 도메인 타입 모음.

export type Source = 'user' | 'ai_draft';

// 백엔드가 원문에서 추정한 섹션 헤딩(#6). canonical은 정규화 카테고리(없으면 빈 문자열).
export interface DetectedSection {
  title: string;
  canonical?: string;
  start?: number;
}

export type ExtractionQualityStatus = 'good' | 'review' | 'poor' | 'failed';
export type ExtractionQualitySource = 'auto' | 'user_edited' | 'ocr';

export interface ExtractionQuality {
  score: number;
  status: ExtractionQualityStatus;
  reasons: string[];
  source: ExtractionQualitySource;
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
  extractionQuality?: ExtractionQuality;
  pdfUrl?: string;
  pdfFilename?: string;
  sections?: DetectedSection[];
  text: string;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'violet';
export type CitationUse =
  | 'premise'
  | 'method'
  | 'comparison'
  | 'counterargument'
  | 'limitation'
  | 'related_work';
export type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'metadata' | 'creating';
export type SamplePhase = 'idle' | 'waking' | 'downloading' | 'extracting' | 'creating';
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
  citationUse?: CitationUse;
  // true면 citationUse가 라벨 기반 자동 제안(§8-4). 사용자가 직접 고르면 false/삭제.
  citationSuggested?: boolean;
  // 원문(paper.text) 내 문자 오프셋. 옛 데이터 호환을 위해 선택적.
  start?: number;
  end?: number;
  // PDF 원본 위 하이라이트. rect 좌표는 scale=1 viewport 기준 CSS 좌표.
  pdf?: {
    page: number;
    rects: {
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  };
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

export interface ManualSummaryItem {
  id: string;
  text: string;
  color: HighlightColor;
  citationUse?: CitationUse;
  // true면 citationUse가 라벨 기반 자동 제안(§8-4). 사용자가 직접 고르면 false/삭제.
  citationSuggested?: boolean;
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
  manualSummaries: ManualSummaryItem[];
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
  // v4.0 읽기 목적 템플릿 id (lib/templates.ts 정의, 기본 t1_general).
  templateId?: string;
  // T1 이외 목적 템플릿의 문항 답변: templateId -> 질문 key -> 답변.
  // T1 답변은 하위 호환을 위해 위 template 필드를 계속 사용한다.
  templateAnswers?: Record<string, Record<string, string>>;
}
