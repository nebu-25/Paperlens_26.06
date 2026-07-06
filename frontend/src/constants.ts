// 앱 전역 상수. 타입 외 다른 모듈에 의존하지 않는다(순환 의존 방지).
import type { CitationUse, HighlightColor, SamplePhase, UploadPhase } from './types';

// API 베이스 경로. 기본은 상대경로 '/api'(개발 시 Vite 프록시, 배포 시 동일 오리진/리버스 프록시).
// 다른 오리진의 백엔드를 직접 가리키려면 VITE_API_BASE_URL로 오버라이드한다(예: http://127.0.0.1:8000).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export const API_BASE = `${API_ORIGIN}/api`;

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? '';
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? '';
export const DEMO_AUTH_ENABLED = Boolean(DEMO_EMAIL && DEMO_PASSWORD);

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
  meaning: string;
  markClass: string;
  listClass: string;
  swatchClass: string;
}[] = [
  {
    value: 'yellow',
    label: '주장',
    meaning: '주장',
    markClass: 'bg-yellow-200/70',
    listClass: 'bg-yellow-50',
    swatchClass: 'bg-yellow-300',
  },
  {
    value: 'green',
    label: '방법론',
    meaning: '방법론',
    markClass: 'bg-emerald-200/70',
    listClass: 'bg-emerald-50',
    swatchClass: 'bg-emerald-300',
  },
  {
    value: 'blue',
    label: '결과',
    meaning: '결과',
    markClass: 'bg-sky-200/70',
    listClass: 'bg-sky-50',
    swatchClass: 'bg-sky-300',
  },
  {
    value: 'pink',
    label: '한계',
    meaning: '한계/비판',
    markClass: 'bg-rose-200/70',
    listClass: 'bg-rose-50',
    swatchClass: 'bg-rose-300',
  },
  {
    value: 'orange',
    label: '질문/후속 확인',
    meaning: '질문/후속 확인',
    markClass: 'bg-orange-200/70',
    listClass: 'bg-orange-50',
    swatchClass: 'bg-orange-300',
  },
  {
    value: 'violet',
    label: '근거',
    meaning: '근거',
    markClass: 'bg-violet-200/70',
    listClass: 'bg-violet-50',
    swatchClass: 'bg-violet-300',
  },
];

export const CITATION_USE_OPTIONS: {
  value: CitationUse;
  label: string;
  helper: string;
}[] = [
  {
    value: 'premise',
    label: '전제 인용',
    helper: '서론이나 문제 제기에서 배경 근거로 사용할 문장',
  },
  {
    value: 'method',
    label: '방법 참고',
    helper: '연구 설계, 실험, 분석 방법을 참고할 문장',
  },
  {
    value: 'comparison',
    label: '결과 비교',
    helper: '내 결과와 비교하거나 논의할 선행 결과',
  },
  {
    value: 'counterargument',
    label: '반론',
    helper: '내 주장과 다른 관점, 상반된 결과, 반대 근거',
  },
  {
    value: 'limitation',
    label: '한계 언급',
    helper: '선행연구의 제한점이나 추가 연구 필요성을 보여주는 문장',
  },
  {
    value: 'related_work',
    label: '관련 연구',
    helper: '직접 근거는 아니지만 함께 묶어 둘 관련 문헌 문장',
  },
];

export const RESEARCH_LINKS = [
  { label: 'KCI', url: 'https://www.kci.go.kr/kciportal/main.kci' },
  { label: 'RISS', url: 'https://www.riss.kr' },
  { label: 'KISS', url: 'https://kiss.kstudy.com' },
  { label: 'Scholar', url: 'https://scholar.google.com' },
] as const;

export const uploadPhaseText: Record<UploadPhase, string> = {
  idle: '',
  uploading: '업로드 중',
  extracting: '텍스트 추출 중',
  metadata: '메타정보 확인 중',
  creating: '노트 생성 중',
};

export const uploadPhasePercent: Record<UploadPhase, number> = {
  idle: 0,
  uploading: 20,
  extracting: 55,
  metadata: 80,
  creating: 100,
};

export const samplePhaseText: Record<SamplePhase, string> = {
  idle: '',
  waking: '백엔드 확인 중',
  downloading: '샘플 PDF 다운로드 중',
  extracting: '샘플 PDF 분석 중',
  creating: '샘플 노트 생성 중',
};

export const samplePhasePercent: Record<SamplePhase, number> = {
  idle: 0,
  waking: 18,
  downloading: 38,
  extracting: 68,
  creating: 92,
};

// localStorage 키: 논문 라이브러리 + 논문별 노트 + 현재 활성 논문을 한 묶음으로 보관
export const STORAGE_KEY = 'paperlens:v1';

// 규칙 기반 용어 힌트: 대문자 약어(2자 이상), 외래어/영문 토큰을 후보로 본다.
// 기획서 8-2 단서대로 정확도는 제한적이며 보조 안내일 뿐이다.
export const HINT_PATTERN = /\b([A-Z]{2,}|[A-Z][a-z]+(?:-[A-Z][a-z]+)*)\b/g;
