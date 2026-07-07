import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { API_BASE, DEMO_AUTH_ENABLED, DEMO_EMAIL, DEMO_PASSWORD } from '../constants';
import { AuthControls } from './AuthControls';
import { BrandLogo } from './BrandLogo';

interface LandingPageProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  onEnterService: () => void;
  onSignOutStarted?: () => void;
  onSignOutComplete?: () => void;
}

const steps = [
  { n: '01', title: '등록', desc: 'PDF·링크·DOI를 넣으면 내용 추출과 정보 정리가 자동으로 진행됩니다.' },
  { n: '02', title: '목적 선택', desc: '"이 논문을 왜 읽나요?" T1~T5 중 하나를 고르면 질문이 딱 맞게 바뀝니다.' },
  { n: '03', title: '3단계 읽기', desc: '훑기 → 골라 읽기 → 정독 순서로 읽고, 밑줄 친 문장에 이름표를 붙입니다.' },
  { n: '04', title: '내보내기·모으기', desc: '정리한 내용을 파일로 내보내고, 여러 논문을 모아 한눈에 봅니다.' },
] as const;

const templates = [
  {
    code: 'T1',
    name: '일반 리뷰',
    desc: '정독할 가치가 있는지 판단하는, 목적이 아직 정해지지 않은 기본 리뷰입니다.',
    dig: '키워드',
    labels: '주장 · 결과',
    done: '5문항 작성',
    questions: ['무엇을 해결하려 하는가', '어떤 방법을 사용했는가', '결과는 무엇인가', '한계는 무엇인가', '내가 이해한 핵심은 무엇인가'],
  },
  {
    code: 'T2',
    name: '선행연구 정리',
    desc: '내 논문의 서론이나 선행연구에 인용할 내용을 모읍니다.',
    dig: '키워드 + 관점',
    labels: '주장 · 근거',
    done: '인용 후보 1개 이상 + "한 문장 소개" 작성',
    questions: ['이 논문이 내 연구와 어떻게 연결되나', '내 논문에서 한 문장으로 소개한다면', '내 연구와의 차별점은', '어떤 맥락(전제·비교·반론)에서 인용할 것인가'],
  },
  {
    code: 'T3',
    name: '방법론 벤치마킹',
    desc: '이 논문의 연구·실험 방법을 내 연구에 가져오거나 비교합니다.',
    dig: '한계(방법의 취약점)',
    labels: '방법론',
    done: '방법론 하이라이트 3개 이상 + 적용 계획 작성',
    questions: ['연구 설계는(대상·표본·조건)', '핵심 절차·도구·지표는', '내 상황에 적용 시 바꿔야 할 것은', '이 방법의 전제 조건과 취약점은'],
  },
  {
    code: 'T4',
    name: '비판적 검토',
    desc: '발표나 반론을 준비할 때 논문을 꼼꼼히 따져보는 읽기입니다. 시그널 스캐너가 처음부터 켜지는 유일한 템플릿입니다.',
    dig: '관점 + 한계 + 비판',
    labels: '한계/비판 · 질문/후속 확인 · 근거',
    done: '`한계/비판` 하이라이트 2개 이상 + "말하지 않은 한계" 작성',
    questions: ['저자의 관점/전제는 무엇인가', '저자가 인정한 한계는', '저자가 말하지 않은 한계는', '주장-근거 사슬에서 가장 약한 고리는', '결과가 성립하지 않는 조건은'],
  },
  {
    code: 'T5',
    name: '결과 비교·수치 수집',
    desc: '성능표 같은, 내 결과와 비교할 숫자를 모읍니다. 그림/표 바로가기와 이어집니다.',
    dig: '결과',
    labels: '결과',
    done: '`결과 비교` 인용 후보 1개 이상',
    questions: ['비교 대상 지표와 값은', '실험 조건이 내 것과 같은가 다른가', '직접 비교 가능한가, 보정이 필요한가'],
  },
] as const;

const competitors = [
  ['Elicit', '1,000편 자동 스크리닝', '한국어 약함'],
  ['Consensus', '2억 편 DB · LLM 답변', '한국어 미지원'],
  ['Scholarcy', 'PDF 구조화 요약', '유료 · 한국어 부족'],
  ['PaperLens', '요약 외 전 작업 자동화 + 발굴 구조화', '한국어 최적화'],
] as const;

const passes = [
  ['1', 'PASS · 훑기', '제목·초록·결론', '읽을 가치가 있는지 판단하고 큰 흐름을 잡습니다.', '섹션 아웃라인 네비게이션'],
  ['2', 'PASS · 표적', '서론·결과·그림', '중요한 결과와 근거를 확인하고, 숫자가 어디 있는지 찾아 둡니다.', '그림/표 네비게이터 · 교차참조'],
  ['3', 'PASS · 정독', '방법·한계 정독', '방법과 한계를 꼼꼼히 살피며 나만의 생각을 만듭니다.', '시그널 스캐너 + 목적 템플릿'],
] as const;

function Pill({ dot = '#65b8a2', children }: { dot?: string; children: ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2">
      <span className="size-[7px] rounded-full" style={{ background: dot }} />
      <span className="text-[13px] font-medium uppercase tracking-[0.055em] text-[#0e4749]">{children}</span>
    </div>
  );
}

function CheckLine({
  children,
  color = '#1c5d5f',
  size = '15px',
  textColor = '#283338',
}: {
  children: ReactNode;
  color?: string;
  size?: string;
  textColor?: string;
}) {
  return (
    <div className="flex gap-2.5" style={{ fontSize: size, color: textColor }}>
      <span className="font-bold" style={{ color }}>
        ✓
      </span>
      <span>{children}</span>
    </div>
  );
}

function ProductMockup() {
  return (
    <div className="relative">
      <div className="absolute -right-1.5 -top-5 text-[22px] text-[#d6aec1]">+</div>
      <div className="overflow-hidden rounded-[14px] border border-[#d7e6e6] bg-white">
        <div className="flex items-center gap-1.5 border-b border-[#eef4f4] px-3.5 py-[11px]">
          <div className="size-[9px] rounded-full bg-[#d6aec1]" />
          <div className="size-[9px] rounded-full bg-[#a2cbcd]" />
          <div className="size-[9px] rounded-full bg-[#cae1e2]" />
          <div className="ml-2 text-[11px] text-[#8aa0a1]">paperlens · 리뷰 노트</div>
        </div>
        <div className="grid min-h-[290px] grid-cols-2">
          <div className="border-r border-[#eef4f4] p-4">
            <div className="mb-2.5 text-[10px] uppercase tracking-[0.05em] text-[#8aa0a1]">원문 · 시그널 스캐너</div>
            <div className="text-[12px] leading-[1.85] text-[#556]">
              We propose a lightweight method{' '}
              <span className="text-[#0e4749]" style={{ borderBottom: '2px dotted #1c5d5f' }}>
                that assumes
              </span>{' '}
              a balanced dataset.{' '}
              <span className="text-[#8a4d66]" style={{ borderBottom: '2px dotted #d6aec1' }}>
                However,
              </span>{' '}
              performance drops on <span className="rounded-[3px] bg-[#e4f0f1] px-0.5">long-tail</span> classes.{' '}
              <span className="text-[#8a4d66]" style={{ borderBottom: '2px dotted #d6aec1' }}>
                A key limitation
              </span>{' '}
              is the small sample size, and we leave this to{' '}
              <span className="text-[#8a4d66]" style={{ borderBottom: '2px dotted #d6aec1' }}>
                future work.
              </span>
            </div>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#f2e8e2] px-2 py-1 text-[10px] text-[#8a4d66]">한계 후보</span>
              <span className="rounded-full bg-[#e4f0f1] px-2 py-1 text-[10px] text-[#0e4749]">관점</span>
              <span className="rounded-full bg-[#e4f0f1] px-2 py-1 text-[10px] text-[#0e4749]">키워드</span>
            </div>
          </div>
          <div className="bg-[#fbfdfd] p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[#e4f0f1] px-[9px] py-1 text-[10px] text-[#283338]">T1</span>
              <span className="rounded-full bg-[#e4f0f1] px-[9px] py-1 text-[10px] text-[#283338]">T2</span>
              <span className="rounded-full bg-[#e4f0f1] px-[9px] py-1 text-[10px] text-[#283338]">T3</span>
              <span className="rounded-full bg-[#1c5d5f] px-[9px] py-1 text-[10px] text-white">T4 비판적 검토</span>
            </div>
            <div className="mb-[7px] text-[9px] uppercase tracking-[0.04em] text-[#8aa0a1]">3-PASS 읽기</div>
            <div className="mb-4 flex gap-1.5">
              <div className="h-[5px] flex-1 rounded-[3px] bg-[#1c5d5f]" />
              <div className="h-[5px] flex-1 rounded-[3px] bg-[#1c5d5f]" />
              <div className="h-[5px] flex-1 rounded-[3px] bg-[#cae1e2]" />
            </div>
            <div className="mb-[9px] rounded-lg border border-[#e4f0f1] bg-white p-[11px]">
              <div className="mb-1.5 text-[11px] text-[#283338]">③ 저자가 말하지 않은 한계는?</div>
              <div className="mb-[5px] h-1.5 rounded-[3px] bg-[#eef4f4]" />
              <div className="h-1.5 w-[70%] rounded-[3px] bg-[#eef4f4]" />
            </div>
            <div className="rounded-lg border border-[#e4f0f1] bg-white p-[11px]">
              <div className="mb-1.5 text-[11px] text-[#283338]">④ 가장 약한 고리는?</div>
              <div className="h-1.5 w-[85%] rounded-[3px] bg-[#eef4f4]" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-[18px] text-[20px] text-[#65b8a2]">✦</div>
    </div>
  );
}

export function LandingPage({
  authEnabled,
  authReady,
  user,
  onEnterService,
  onSignOutStarted,
  onSignOutComplete,
}: LandingPageProps) {
  const [active, setActive] = useState(3);
  const [loginOpen, setLoginOpen] = useState(false);
  const [serviceLinkCopied, setServiceLinkCopied] = useState(false);
  // 'demo': 데모 계정 프리필(신규 체험 CTA) · 'personal': 빈 폼(기존 사용자 로그인)
  const [loginMode, setLoginMode] = useState<'demo' | 'personal'>('demo');
  const activeTpl = templates[active];
  const demoPrefill = loginMode === 'demo';
  const serviceUrl = `${window.location.origin}${import.meta.env.BASE_URL}service_home/`;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 75000);
    void fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    }).catch(() => undefined);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // 로그인 모달이 열리면 이메일 입력에 포커스, Esc로 닫기, 배경 스크롤 잠금
  useEffect(() => {
    if (!loginOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLoginOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => document.getElementById('paperlens-auth-email')?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [loginOpen]);

  function openLogin(mode: 'demo' | 'personal') {
    setLoginMode(mode);
    setLoginOpen(true);
  }

  // 신규 체험 CTA: 로그인 상태면 바로 서비스로, 아니면 데모 프리필 모달
  function start() {
    if (user) onEnterService();
    else openLogin('demo');
  }

  async function copyServiceLink() {
    try {
      await navigator.clipboard.writeText(serviceUrl);
      setServiceLinkCopied(true);
      window.setTimeout(() => setServiceLinkCopied(false), 2200);
    } catch {
      setServiceLinkCopied(false);
    }
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-[#f2f8f7] text-[#283338]"
      style={{ fontFamily: "'Pretendard','Pretendard Variable',system-ui,sans-serif" }}
    >
      {/* ============ NAV ============ */}
      <div className="sticky top-0 z-50 border-b border-[#e4f0f1] bg-[#f2f8f7]/[0.88] backdrop-blur-[10px]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-6 px-8 py-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={26} wordmarkClassName="text-[21px]" />
            <span className="rounded-full border border-[#a2cbcd] bg-[#e4f0f1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[#0e4749]">
              Beta
            </span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#why" className="text-sm text-[#283338] hover:text-[#1c5d5f]">왜 만들었나</a>
            <a href="#how" className="text-sm text-[#283338] hover:text-[#1c5d5f]">사용 방법</a>
            <a href="#templates" className="text-sm text-[#283338] hover:text-[#1c5d5f]">목적 템플릿</a>
          </div>
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              className="text-sm text-[#283338] hover:text-[#1c5d5f]"
              onClick={() => (user ? onEnterService() : openLogin('personal'))}
            >
              {user ? '서비스로 이동' : '로그인'}
            </button>
            <button
              type="button"
              className="rounded-full bg-[#1c5d5f] px-[18px] py-[9px] text-sm font-medium text-white hover:bg-[#156152]"
              onClick={start}
            >
              무료로 시작
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-[#d7e6e6] bg-white px-5 py-3 md:hidden">
        <div className="mx-auto max-w-[560px]">
          <p className="text-[13px] font-semibold text-[#0e4749]">
            PaperLens는 데스크톱 화면에 최적화되어 있습니다.
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#556]">
            휴대폰에서는 소개를 먼저 확인하고, 실제 논문 리뷰는 노트북에서 사용해 주세요.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded border border-[#a2cbcd] px-2.5 py-1.5 text-[12px] font-semibold text-[#0e4749]"
              onClick={() => void copyServiceLink()}
            >
              {serviceLinkCopied ? <Check size={13} /> : <Copy size={13} />}
              {serviceLinkCopied ? '복사됨' : '서비스 링크 복사'}
            </button>
            <span className="min-w-0 truncate text-[11px] text-[#8aa0a1]">{serviceUrl}</span>
          </div>
        </div>
      </div>

      {/* ============ HERO ============ */}
      <div className="relative mx-auto max-w-[1120px] px-8 pb-10 pt-16">
        <div className="absolute left-3.5 top-[120px] text-[26px] text-[#65b8a2]">✦</div>
        <div className="absolute right-[40%] top-9 size-3.5 rounded-full border-2 border-[#d6aec1]" />
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="mb-[26px] inline-flex items-center gap-2.5 rounded-full border border-[#a2cbcd] bg-[#e4f0f1] px-4 py-[7px]">
              <span className="text-[13px] text-[#1c5d5f]">✦</span>
              <span className="text-[12px] font-medium uppercase tracking-[0.05em] text-[#0e4749]">요약은 당신, 잡무는 도구</span>
            </div>
            <h1 className="mb-[22px] max-w-[532px] font-serif text-[44px] font-normal leading-[1.12] tracking-[-0.01em] sm:text-[51px]">
              AI가 요약해주는 도구는 많죠.
              <br />
              우리는 <span className="font-semibold text-[#1c5d5f]">당신이 직접 읽게</span> 돕습니다.
            </h1>
            <p className="mb-8 max-w-[480px] text-[17px] leading-[1.6] text-[#333]">
              논문을 이해하고 요약하고 따져보는 일은 사용자의 몫입니다. 대신 파일 올리기, 정보 정리, 내보내기처럼 손이 많이 가는 일은
              도구가 자동으로 처리하고, <b>무엇을 봐야 하는지</b>만 짚어 드립니다.
            </p>
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                className="rounded-full bg-[#1c5d5f] px-[26px] py-3.5 text-[15px] font-medium text-white hover:bg-[#156152]"
                onClick={start}
              >
                무료로 리뷰 노트 만들기
              </button>
              <a
                href="#how"
                className="rounded-full border border-[#0e4749] px-6 py-[13px] text-[15px] font-medium text-[#0e4749]"
              >
                사용 방법 보기 →
              </a>
            </div>
            <div className="mt-5 text-[12px] tracking-[0.04em] text-[#0e4749]">
              한국어 논문(KCI 포함)도 자동으로 정리됩니다 · <span className="font-semibold">현재 베타 테스트 중</span>
            </div>
          </div>
          <ProductMockup />
        </div>
      </div>

      {/* ============ TRUST / STAT STRIP ============ */}
      <div className="mx-auto mt-6 max-w-[1120px] px-8">
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[#e4f0f1] px-8 py-5 text-center text-[13px] tracking-[0.03em] text-[#283338]">
          <span><b className="font-semibold">5종</b> 목적 템플릿</span>
          <span className="text-[#a2cbcd]">|</span>
          <span><b className="font-semibold">3단계</b> 읽기 가이드</span>
          <span className="text-[#a2cbcd]">|</span>
          <span><b className="font-semibold">6단계</b> 자동 정보 정리</span>
          <span className="text-[#a2cbcd]">|</span>
          <span><b className="font-semibold">요약 AI 0개</b> · 의심할 대상이 없음</span>
        </div>
      </div>

      {/* ============ WHY IT EXISTS ============ */}
      <div id="why" className="mx-auto max-w-[1120px] px-8 pt-24">
        <div className="mx-auto mb-12 max-w-[820px] text-center">
          <Pill>WHY PAPERLENS · 왜 만들었나</Pill>
          <h2 className="mb-[18px] break-keep font-serif text-[34px] font-normal leading-[1.18] sm:text-[40px]">
            AI가 대신 읽어 주는 도구는 이미 많습니다.
            <br />
            우리는 <span className="font-semibold">정확히 그 반대</span>를 만들었습니다.
          </h2>
          <p className="text-[17px] leading-[1.6] text-[#333]">
            여러 전문가의 조언과 경쟁 서비스를 살펴보고 내린 결론은 하나였습니다.
            <br />
            직접 생각하는 과정이 가장 중요하다는 것입니다.
            <br />
            그래서 아래 세 가지를 정했습니다.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-xl bg-[#e4f0f1] p-7">
            <div className="mb-4 text-[12px] tracking-[0.05em] text-[#0e4749]">01 / DECISION</div>
            <div className="relative mb-[18px] h-[110px] overflow-hidden rounded-[10px] border border-[#d7e6e6] bg-white">
              <div className="absolute inset-x-4 top-4 h-2 rounded bg-[#eef4f4]" />
              <div className="absolute left-4 top-8 h-2 w-[60%] rounded bg-[#eef4f4]" />
              <div className="absolute inset-x-4 bottom-4 top-14 flex items-center justify-center rounded-lg border-2 border-dashed border-[#d6aec1] text-[11px] text-[#8a4d66]">
                AI 요약 초안 — 제거됨
              </div>
            </div>
            <h3 className="mb-2.5 font-serif text-[22px] font-semibold">AI 요약을 없앴습니다</h3>
            <p className="text-[15px] leading-[1.6] text-[#333]">
              AI가 만든 요약은 결국 "진짜 맞나?"를 확인하는 일을 새로 만듭니다. 그래서 요약 기능을 아예 넣지 않았습니다.{' '}
              <b>의심할 대상 자체가 없습니다.</b>
            </p>
          </article>
          <article className="rounded-xl bg-[#e4f0f1] p-7">
            <div className="mb-4 text-[12px] tracking-[0.05em] text-[#0e4749]">02 / DECISION</div>
            <div className="mb-[18px] flex h-[110px] flex-col justify-center gap-[7px] rounded-[10px] border border-[#d7e6e6] bg-white p-3.5">
              <div className="flex gap-1.5">
                <span className="rounded-full bg-[#1c5d5f] px-2 py-[3px] text-[10px] text-white">T4 비판</span>
                <span className="rounded-full bg-[#e4f0f1] px-2 py-[3px] text-[10px] text-[#283338]">T2 선행연구</span>
              </div>
              <div className="text-[11px] text-[#556]">"저자가 말하지 않은 한계는?"</div>
              <div className="text-[11px] text-[#8aa0a1]">"한 문장으로 소개한다면?"</div>
            </div>
            <h3 className="mb-2.5 font-serif text-[22px] font-semibold">목적별 템플릿</h3>
            <p className="text-[15px] leading-[1.6] text-[#333]">
              똑같은 논문이라도 <b>왜 읽느냐에 따라 물어볼 질문이 달라집니다.</b> 그래서 목적마다 질문과 정리 방법이 다른 5가지
              템플릿을 준비했습니다.
            </p>
          </article>
          <article className="rounded-xl bg-[#e4f0f1] p-7">
            <div className="mb-4 text-[12px] tracking-[0.05em] text-[#0e4749]">03 / DECISION</div>
            <div className="mb-[18px] h-[110px] overflow-hidden rounded-[10px] border border-[#d7e6e6] bg-white p-3.5 text-[11px] leading-[1.9] text-[#556]">
              the model{' '}
              <span className="text-[#8a4d66]" style={{ borderBottom: '2px dotted #d6aec1' }}>
                is limited by
              </span>{' '}
              data …{' '}
              <span className="text-[#0e4749]" style={{ borderBottom: '2px dotted #1c5d5f' }}>
                we assume
              </span>{' '}
              that …{' '}
              <span className="text-[#8a4d66]" style={{ borderBottom: '2px dotted #d6aec1' }}>
                however
              </span>{' '}
              the results …
            </div>
            <h3 className="mb-2.5 font-serif text-[22px] font-semibold">시그널 스캐너</h3>
            <p className="text-[15px] leading-[1.6] text-[#333]">
              논문의 약점과 한계를 빨리 찾도록 도와드립니다. 중요해 보이는 <b>문장에 밑줄만</b> 그어 위치를 알려줄 뿐, 뜻을 판단하는
              일은 여전히 사용자의 몫입니다. AI 요약이 아닙니다.
            </p>
          </article>
        </div>
      </div>

      {/* ============ COMPETITOR POSITIONING ============ */}
      <div className="mt-24 bg-[#f2e8e2]">
        <div className="mx-auto max-w-[1120px] px-8 py-20">
          <div className="grid items-center gap-14 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <Pill dot="#d6aec1">POSITIONING · 경쟁 분석</Pill>
              <h2 className="mb-[18px] font-serif text-[35px] font-normal leading-[1.18]">
                찾아 주거나 만들어 주거나.
                <br />
                <span className="font-semibold">그 사이가 비어 있었습니다.</span>
              </h2>
              <p className="text-[15px] leading-[1.65] text-[#333]">
                다른 서비스는 논문을 <b>찾아 주거나</b> 내용을 <b>요약해 줍니다.</b>
                <br />
                PaperLens는 그 둘 대신, 번거로운 일을 전부 대신하고
                <br />
                목적에 맞게 무엇을 챙겨야 할지 정리해 드립니다.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              {competitors.map(([name, value, note]) => {
                const isUs = name === 'PaperLens';
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-4 rounded-[10px] px-[18px] py-3.5 ${
                      isUs ? 'bg-[#1c5d5f]' : 'border border-[#ecdcd2] bg-white'
                    }`}
                  >
                    <span className={`min-w-[130px] text-[13px] font-semibold ${isUs ? 'text-white' : ''}`}>{name}</span>
                    <span className={`flex-1 text-[14px] ${isUs ? 'text-[#cae1e2]' : 'text-[#556]'}`}>{value}</span>
                    <span className={`text-[12px] ${isUs ? 'text-[#a2cbcd]' : 'text-[#8a4d66]'}`}>{note}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ============ HOW TO USE — 3 PASS ============ */}
      <div id="how" className="mx-auto max-w-[1120px] px-8 pt-24">
        <div className="mx-auto mb-[52px] max-w-[820px] text-center">
          <Pill>HOW IT WORKS · 사용 방법</Pill>
          <h2 className="mb-[18px] break-keep font-serif text-[44px] font-normal leading-[1.18]">
            논문을 처음부터 정독하지 마세요.
            <br />
            <span className="font-semibold italic">3-pass</span>로 읽으면 됩니다.
          </h2>
          <p className="text-[17px] leading-[1.6] text-[#333]">
            "어디부터 읽지?"라는 막막함을 없애기 위해, 잘 알려진 3단계 읽기법을 그대로 안내합니다. 각 단계에 필요한 기능이 화면에
            딱 맞게 연결되어 있습니다.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {passes.map(([num, label, title, body, tool]) => (
            <article key={num} className="rounded-xl border border-[#e4f0f1] bg-white p-7">
              <div className="mb-3.5 flex items-baseline gap-2.5">
                <span className="font-serif text-[40px] font-semibold leading-none text-[#1c5d5f]">{num}</span>
                <span className="text-[13px] tracking-[0.05em] text-[#0e4749]">{label}</span>
              </div>
              <h3 className="mb-2 text-[19px] font-bold">{title}</h3>
              <p className="mb-3.5 text-[14.5px] leading-[1.6] text-[#556]">{body}</p>
              <div className="flex items-center gap-2 rounded-lg bg-[#e4f0f1] px-3 py-2.5 text-[13px] text-[#0e4749]">
                <span className="font-bold text-[#1c5d5f]">→</span> {tool}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-14 rounded-xl border border-[#e4f0f1] bg-white px-10 py-9">
          <div className="mb-6 text-[12px] uppercase tracking-[0.05em] text-[#8aa0a1]">등록에서 산출물까지 · 4단계</div>
          <div className="grid gap-7 md:grid-cols-4">
            {steps.map((step) => (
              <div key={step.n} className="border-t-2 border-[#65b8a2] pt-4">
                <div className="mb-2 text-[12px] text-[#1c5d5f]">STEP {step.n}</div>
                <h4 className="mb-1.5 text-base font-bold">{step.title}</h4>
                <p className="text-[13.5px] leading-[1.55] text-[#556]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ INTERACTIVE PURPOSE TEMPLATES ============ */}
      <div id="templates" className="mx-auto max-w-[1120px] px-8 pt-24">
        <div className="mx-auto mb-11 max-w-[820px] text-center">
          <Pill dot="#16325a">PURPOSE TEMPLATES · 목적 축</Pill>
          <h2 className="mb-[18px] break-keep font-serif text-[44px] font-normal leading-[1.18]">
            왜 읽느냐를 고르면,
            <br />
            <span className="font-semibold">물어야 할 질문</span>이 바뀝니다.
          </h2>
          <p className="text-[17px] leading-[1.6] text-[#333]">
            목적을 고르면 질문과 정리 방식이 바뀝니다. 얼마나 깊이 읽었는지는
            <br />
            3단계 로드맵이 대신 챙겨 드립니다.
          </p>
        </div>

        <div className="mb-7 flex flex-wrap justify-center gap-2.5">
          {templates.map((template, index) => (
            <button
              key={template.code}
              type="button"
              className={`rounded-full border px-[18px] py-2.5 text-sm font-medium transition ${
                index === active ? 'border-[#1c5d5f] bg-[#1c5d5f] text-white' : 'border-[#cfe2e2] bg-white text-[#283338]'
              }`}
              onClick={() => setActive(index)}
            >
              <span className="font-semibold">{template.code}</span> {template.name}
            </button>
          ))}
        </div>

        <div className="grid gap-11 rounded-2xl bg-[#e4f0f1] p-8 lg:grid-cols-[1fr_1.2fr] lg:p-10">
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="rounded-full bg-[#1c5d5f] px-3 py-1 text-[15px] font-semibold text-white">{activeTpl.code}</span>
              <span className="font-serif text-[26px] font-semibold">{activeTpl.name}</span>
            </div>
            <p className="mb-6 text-base leading-[1.6] text-[#333]">{activeTpl.desc}</p>
            <div className="grid gap-3.5">
              {[
                ['주 발굴', activeTpl.dig],
                ['권장 라벨', activeTpl.labels],
                ['완료 기준', activeTpl.done],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 text-[11px] uppercase tracking-[0.05em] text-[#0e4749]">{label}</div>
                  <div className="text-[15px] font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-white px-7 py-6">
            <div className="mb-4 text-[11px] uppercase tracking-[0.05em] text-[#8aa0a1]">질문 카드 — 답은 당신이 채웁니다</div>
            <div className="grid gap-2.5">
              {activeTpl.questions.map((question, index) => (
                <div key={question} className="flex items-start gap-3 border-b border-[#f0f5f5] pb-2.5 last:border-b-0">
                  <span className="font-serif text-lg font-semibold leading-[1.3] text-[#65b8a2]">
                    {['①', '②', '③', '④', '⑤'][index]}
                  </span>
                  <span className="text-[15px] leading-[1.45] text-[#283338]">{question}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============ FEATURE CARDS ============ */}
      <div className="mx-auto max-w-[1120px] px-8 pt-24">
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-xl bg-[#e4f0f1] p-8">
            <div className="mb-[18px] inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#1c5d5f]" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#0e4749]">automate · 잡무 자동화</span>
            </div>
            <h3 className="mb-[18px] font-serif text-[28px] font-semibold">읽기 주변부는 도구가 합니다</h3>
            <div className="grid gap-2.5">
              <CheckLine>PDF·링크·DOI만 넣으면 논문 정보를 자동으로 채워 줍니다</CheckLine>
              <CheckLine>내용이 잘 뽑혔는지 점수(0~100)로 알려 줍니다</CheckLine>
              <CheckLine>인용할 만한 문장을 한곳에 모아 둡니다</CheckLine>
              <CheckLine>파일로 내보내고, 쓰던 내용은 자동으로 저장됩니다</CheckLine>
            </div>
          </article>
          <article className="rounded-xl bg-[#e4f0f1] p-8">
            <div className="mb-[18px] inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[#16325a]" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[#0e4749]">synthesize · 종합</span>
            </div>
            <h3 className="mb-[18px] font-serif text-[28px] font-semibold">읽은 것을 연구 질문으로</h3>
            <div className="grid gap-2.5">
              <CheckLine color="#16325a">저장한 논문을 목적별로 다시 모아 봅니다</CheckLine>
              <CheckLine color="#16325a">자주 나오는 한계에서 아직 풀리지 않은 문제를 찾습니다</CheckLine>
              <CheckLine color="#16325a">검증된 틀(FINER·PICOT·PESICO)로 연구 질문을 만듭니다</CheckLine>
              <CheckLine color="#16325a">정리한 내용이 어느 논문에서 왔는지 바로 찾아갑니다</CheckLine>
            </div>
            <button
              type="button"
              className="mt-[22px] rounded-full bg-[#16325a] px-[22px] py-[11px] text-sm font-medium text-white"
              onClick={start}
            >
              연구 질문 빌더 살펴보기
            </button>
          </article>
        </div>
      </div>

      {/* ============ CLOSING CTA ============ */}
      <div className="mx-auto max-w-[1120px] px-8 py-24">
        <div className="relative overflow-hidden rounded-[18px] bg-[#16325a] px-12 py-16 text-center">
          <div className="absolute left-10 top-[34px] text-2xl text-[#65b8a2]">✦</div>
          <div className="absolute bottom-10 right-[52px] text-2xl text-[#d6aec1]">+</div>
          <h2 className="mb-4 font-serif text-[42px] font-normal leading-[1.2] text-white">
            읽기는 당신의 몫으로, <span className="font-semibold text-[#cae1e2]">나머지는 우리에게.</span>
          </h2>
          <p className="mx-auto mb-[30px] max-w-[520px] text-[17px] text-[#a2cbcd]">
            AI를 연결하지 않아도 목적 템플릿, 3단계 읽기, 바로가기, 시그널 스캐너, 모아보기, 연구 질문 만들기까지 전부 그대로 쓸 수
            있습니다.
          </p>
          <button
            type="button"
            className="rounded-full bg-white px-8 py-[15px] text-[15px] font-medium text-[#16325a]"
            onClick={start}
          >
            무료로 리뷰 노트 만들기
          </button>
        </div>
      </div>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-[#e4f0f1]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-5 px-8 py-9">
          <BrandLogo size={22} wordmarkClassName="text-lg" />
          <div className="text-xs tracking-[0.03em] text-[#8aa0a1]">논문 리뷰·정리 워크스페이스 · v4.0 · 베타 테스트 중</div>
        </div>
      </footer>

      {/* ============ LOGIN MODAL ============ */}
      {loginOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#0e2b2c]/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paperlens-login-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLoginOpen(false);
          }}
        >
          <div className="relative my-auto w-full max-w-[520px] rounded-2xl border border-[#e4f0f1] bg-white p-6 shadow-xl">
            <button
              type="button"
              className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-[#8aa0a1] hover:bg-[#f2f8f7] hover:text-[#0e4749]"
              aria-label="닫기"
              onClick={() => setLoginOpen(false)}
            >
              ✕
            </button>
            <div className="mb-4 pr-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0e4749]">SERVICE LOGIN</p>
              <h2 id="paperlens-login-title" className="mt-1 font-serif text-[26px] font-semibold">
                {user ? '서비스 입장 준비 완료' : demoPrefill && DEMO_AUTH_ENABLED ? '데모 계정으로 시작' : '로그인 후 서비스 시작'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#556]">
                {user
                  ? '계정 인증이 완료되었습니다. 저장된 논문과 리뷰 노트를 바로 이어서 확인할 수 있습니다.'
                  : demoPrefill && DEMO_AUTH_ENABLED
                    ? '데모 계정 정보가 입력되어 있습니다. 로그인하면 샘플 PDF와 리뷰 노트 흐름을 확인할 수 있습니다.'
                    : '가입한 계정으로 로그인하면 저장된 논문과 리뷰 노트를 이어서 확인할 수 있습니다.'}
              </p>
            </div>
            <AuthControls
              enabled={authEnabled}
              ready={authReady}
              user={user}
              initialEmail={demoPrefill ? DEMO_EMAIL : ''}
              initialPassword={demoPrefill ? DEMO_PASSWORD : ''}
              demoEmail={DEMO_EMAIL}
              demoPassword={DEMO_PASSWORD}
              onEnterService={onEnterService}
              onSignOutStarted={onSignOutStarted}
              onSignOutComplete={onSignOutComplete}
            />
            {import.meta.env.DEV && !authEnabled && (
              <div className="mt-4 rounded border border-dashed border-line bg-paper p-3">
                <p className="text-xs leading-5 text-muted">
                  <b className="text-ink">개발 모드</b> — Supabase 로그인 설정 없이 로컬 사용자로 워크스페이스를 열 수 있습니다.
                </p>
                <button
                  type="button"
                  className="mt-2 w-full rounded border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-action hover:text-action"
                  onClick={onEnterService}
                >
                  개발 모드로 시작
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
