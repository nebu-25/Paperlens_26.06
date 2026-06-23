// 앱 전역 상수. 타입 외 다른 모듈에 의존하지 않는다(순환 의존 방지).
import type { HighlightColor, Paper, UploadPhase } from './types';

// API 베이스 경로. 기본은 상대경로 '/api'(개발 시 Vite 프록시, 배포 시 동일 오리진/리버스 프록시).
// 다른 오리진의 백엔드를 직접 가리키려면 VITE_API_BASE_URL로 오버라이드한다(예: http://127.0.0.1:8000).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api`;

export function resolveApiUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/api/')) return `${API_ORIGIN}${path}`;
  if (path.startsWith('/')) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

export const MEMO_SECTIONS = ['Abstract', 'Introduction', 'Method', 'Result', 'Discussion'] as const;

// ③ 섹션별 요약의 기본 섹션. 자동 분류(PAPER.sections) 연동 전까지의 기본값.
export const SUMMARY_SECTIONS = ['Introduction', 'Method', 'Result', 'Conclusion'] as const;

export const TEMPLATE_QUESTIONS = [
  { key: 'q1', label: '이 논문은 무엇을 해결하려 하는가?' },
  { key: 'q2', label: '어떤 방법을 사용했는가?' },
  { key: 'q3', label: '결과는 무엇인가?' },
  { key: 'q4', label: '한계는 무엇인가?' },
  { key: 'q5', label: '내가 이해한 핵심은 무엇인가?' },
] as const;

export const HIGHLIGHT_COLORS: {
  value: HighlightColor;
  label: string;
  markClass: string;
  listClass: string;
  swatchClass: string;
}[] = [
  {
    value: 'yellow',
    label: '노랑',
    markClass: 'bg-yellow-200/70',
    listClass: 'bg-yellow-50',
    swatchClass: 'bg-yellow-300',
  },
  {
    value: 'green',
    label: '초록',
    markClass: 'bg-emerald-200/70',
    listClass: 'bg-emerald-50',
    swatchClass: 'bg-emerald-300',
  },
  {
    value: 'blue',
    label: '파랑',
    markClass: 'bg-sky-200/70',
    listClass: 'bg-sky-50',
    swatchClass: 'bg-sky-300',
  },
  {
    value: 'pink',
    label: '분홍',
    markClass: 'bg-rose-200/70',
    listClass: 'bg-rose-50',
    swatchClass: 'bg-rose-300',
  },
  {
    value: 'orange',
    label: '주황',
    markClass: 'bg-orange-200/70',
    listClass: 'bg-orange-50',
    swatchClass: 'bg-orange-300',
  },
];

export const uploadPhaseText: Record<UploadPhase, string> = {
  idle: '',
  uploading: '업로드 중',
  extracting: '텍스트 추출 중',
  metadata: '메타정보 확인 중',
  creating: '노트 생성 중',
};

export const SAMPLE_PAPER: Omit<Paper, 'id'> = {
  title: 'Attention Is All You Need',
  authors: 'Vaswani et al. (2017)',
  link: 'https://arxiv.org/abs/1706.03762',
  text: `We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence.

Multi-Head Attention allows the model to jointly attend to information from different representation subspaces at different positions. The Transformer model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU.`,
};

// localStorage 키: 논문 라이브러리 + 논문별 노트 + 현재 활성 논문을 한 묶음으로 보관
export const STORAGE_KEY = 'paperlens:v1';

// 규칙 기반 용어 힌트: 대문자 약어(2자 이상), 외래어/영문 토큰을 후보로 본다.
// 기획서 8-2 단서대로 정확도는 제한적이며 보조 안내일 뿐이다.
export const HINT_PATTERN = /\b([A-Z]{2,}|[A-Z][a-z]+(?:-[A-Z][a-z]+)*)\b/g;
