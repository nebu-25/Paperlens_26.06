import { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { API_BASE, DEMO_AUTH_ENABLED, DEMO_EMAIL, DEMO_PASSWORD } from '../constants';
import { AuthControls } from './AuthControls';

interface LandingPageProps {
  authEnabled: boolean;
  authReady: boolean;
  user: User | null;
  onEnterService: () => void;
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

function Pill({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 inline-flex items-center gap-2">
      <span className="size-[7px] rounded-full bg-[#65b8a2]" />
      <span className="text-[13px] font-medium uppercase tracking-[0.055em] text-[#0e4749]">{children}</span>
    </div>
  );
}

function CheckLine({
  children,
  color = '#1c5d5f',
  muted = false,
}: {
  children: ReactNode;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex gap-2.5 text-[15px] ${muted ? 'text-[#e4f0f1]' : 'text-[#283338]'}`}>
      <span className="font-bold" style={{ color }}>
        ✓
      </span>
      <span>{children}</span>
    </div>
  );
}

export function LandingPage({ authEnabled, authReady, user, onEnterService }: LandingPageProps) {
  const [active, setActive] = useState(3);
  const activeTpl = templates[active];

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

  function focusLogin() {
    document.getElementById('paperlens-auth-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => document.getElementById('paperlens-auth-email')?.focus(), 300);
  }

  function start() {
    if (user) onEnterService();
    else focusLogin();
  }

  return (
    <main className="min-h-screen bg-[#f8fbfa] font-sans text-[#283338]">
      <section className="bg-[#1c5d5f] px-8 py-20 text-[#f2f8f7]">
        <div className="mx-auto max-w-6xl">
          <div className="mb-20 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-[#f2f8f7]" />
              <span className="font-serif text-2xl font-semibold">PaperLens</span>
            </div>
            <button
              type="button"
              className="rounded-full border border-[#cae1e2]/70 px-5 py-2 text-sm font-medium text-[#f2f8f7] hover:bg-[#f2f8f7] hover:text-[#1c5d5f]"
              onClick={start}
            >
              무료로 리뷰 노트 만들기
            </button>
          </div>

          <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
            <div>
              <div className="mb-5 text-[13px] font-medium uppercase tracking-[0.07em] text-[#cae1e2]">
                PAPERLENS · 왜 만들었나
              </div>
              <h1 className="max-w-3xl font-serif text-[52px] font-normal leading-[1.08] sm:text-[72px]">
                AI가 대신 읽어 주는 도구는 이미 많습니다.
              </h1>
            </div>
            <div className="max-w-xl text-[18px] leading-[1.75] text-[#d8eceb]">
              우리는 정확히 그 반대를 만들었습니다. 여러 전문가의 조언과 경쟁 서비스를 살펴보고 내린
              결론은 하나였습니다. 직접 생각하는 과정이 가장 중요하다는 것입니다. 그래서 아래 세 가지를 정했습니다.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-8 pt-20 lg:grid-cols-3">
        <article className="rounded-xl bg-[#e4f0f1] p-8">
          <div className="mb-5 text-xs uppercase tracking-[0.05em] text-[#0e4749]">01 / DECISION</div>
          <div className="mb-5 rounded-lg bg-white p-4 font-mono text-sm text-[#8aa0a1] line-through">
            AI 요약 초안 — 제거됨
          </div>
          <h2 className="mb-3 font-serif text-[28px] font-semibold">AI 요약을 없앴습니다</h2>
          <p className="text-[15px] leading-[1.65] text-[#556]">
            AI가 만든 요약은 결국 "진짜 맞나?"를 확인하는 일을 새로 만듭니다. 그래서 요약 기능을 아예 넣지
            않았습니다. 의심할 대상 자체가 없습니다.
          </p>
        </article>
        <article className="rounded-xl bg-[#e4f0f1] p-8">
          <div className="mb-5 text-xs uppercase tracking-[0.05em] text-[#0e4749]">02 / DECISION</div>
          <div className="mb-5 grid gap-2">
            <div className="rounded bg-[#1c5d5f] px-3 py-2 text-sm text-white">T4 비판 · "저자가 말하지 않은 한계는?"</div>
            <div className="rounded bg-white px-3 py-2 text-sm text-[#1c5d5f]">T2 선행연구 · "한 문장으로 소개한다면?"</div>
          </div>
          <h2 className="mb-3 font-serif text-[28px] font-semibold">목적별 템플릿</h2>
          <p className="text-[15px] leading-[1.65] text-[#556]">
            똑같은 논문이라도 왜 읽느냐에 따라 물어볼 질문이 달라집니다. 그래서 목적마다 질문과 정리 방법이 다른
            5가지 템플릿을 준비했습니다.
          </p>
        </article>
        <article className="rounded-xl bg-[#e4f0f1] p-8">
          <div className="mb-5 text-xs uppercase tracking-[0.05em] text-[#0e4749]">03 / DECISION</div>
          <div className="mb-5 rounded-lg bg-white p-4 font-mono text-sm leading-7 text-[#556]">
            the model is limited by data
            <br />
            we assume that
            <br />
            however the results
          </div>
          <h2 className="mb-3 font-serif text-[28px] font-semibold">시그널 스캐너</h2>
          <p className="text-[15px] leading-[1.65] text-[#556]">
            논문의 약점과 한계를 빨리 찾도록 도와드립니다. 중요해 보이는 문장에 밑줄만 그어 위치를 알려줄 뿐,
            뜻을 판단하는 일은 여전히 사용자의 몫입니다.
          </p>
        </article>
      </section>

      <section className="mx-auto max-w-6xl px-8 pt-24">
        <Pill>POSITIONING · 경쟁 분석</Pill>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="font-serif text-[44px] font-normal leading-[1.18]">
              찾아 주거나 만들어 주거나.
              <br />
              그 사이가 비어 있었습니다.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.65] text-[#333]">
              다른 서비스는 논문을 찾아 주거나 내용을 요약해 줍니다. PaperLens는 그 둘 대신, 번거로운 일을 전부
              대신하고 목적에 맞게 무엇을 챙겨야 할지 정리해 드립니다.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#e4f0f1] bg-white">
            {competitors.map(([name, value, note]) => (
              <div key={name} className={`grid grid-cols-[0.72fr_1.1fr_0.85fr] gap-3 border-b border-[#e4f0f1] p-4 text-sm last:border-b-0 ${name === 'PaperLens' ? 'bg-[#e4f0f1]' : ''}`}>
                <b>{name}</b>
                <span>{value}</span>
                <span className="text-[#667]">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-8 pt-24">
        <Pill>HOW IT WORKS · 사용 방법</Pill>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-serif text-[44px] font-normal leading-[1.18]">
              논문을 처음부터
              <br />
              정독하지 마세요.
              <br />
              <span className="font-semibold">3-pass</span>로 읽으면 됩니다.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.65] text-[#333]">
              "어디부터 읽지?"라는 막막함을 없애기 위해, 잘 알려진 3단계 읽기법을 그대로 안내합니다. 각 단계에
              필요한 기능이 화면에 딱 맞게 연결되어 있습니다.
            </p>
          </div>
          <div className="grid gap-4">
            {[
              ['1 PASS · 훑기', '제목·초록·결론', '읽을 가치가 있는지 판단하고 큰 흐름을 잡습니다.', '섹션 아웃라인 네비게이션'],
              ['2 PASS · 표적', '서론·결과·그림', '중요한 결과와 근거를 확인하고, 숫자가 어디 있는지 찾아 둡니다.', '그림/표 네비게이터 · 교차참조'],
              ['3 PASS · 정독', '방법·한계', '방법과 한계를 꼼꼼히 살피며 나만의 생각을 만듭니다.', '시그널 스캐너 + 목적 템플릿'],
            ].map(([label, title, body, tool]) => (
              <article key={label} className="rounded-xl bg-white p-6">
                <div className="mb-2 text-xs uppercase tracking-[0.05em] text-[#0e4749]">{label}</div>
                <h3 className="mb-2 text-lg font-bold">{title}</h3>
                <p className="mb-4 text-[15px] leading-[1.6] text-[#556]">{body}</p>
                <div className="inline-flex items-center gap-2 rounded-lg bg-[#e4f0f1] px-3 py-2 text-[13px] text-[#0e4749]">
                  <span className="font-bold text-[#1c5d5f]">→</span> {tool}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-xl border border-[#e4f0f1] bg-white px-10 py-9">
          <div className="mb-6 text-xs uppercase tracking-[0.05em] text-[#8aa0a1]">등록에서 산출물까지 · 4단계</div>
          <div className="grid gap-7 md:grid-cols-4">
            {steps.map((step) => (
              <div key={step.n} className="border-t-2 border-[#65b8a2] pt-4">
                <div className="mb-2 text-xs text-[#1c5d5f]">STEP {step.n}</div>
                <h4 className="mb-1.5 text-base font-bold">{step.title}</h4>
                <p className="text-[13.5px] leading-[1.55] text-[#556]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="templates" className="mx-auto max-w-6xl px-8 pt-24">
        <div className="mx-auto mb-11 max-w-[720px] text-center">
          <Pill>PURPOSE TEMPLATES · 목적 축</Pill>
          <h2 className="mb-4 font-serif text-[44px] font-normal leading-[1.18]">
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
                  <span className="font-serif text-lg font-semibold leading-[1.3] text-[#65b8a2]">{['①', '②', '③', '④', '⑤'][index]}</span>
                  <span className="text-[15px] leading-[1.45] text-[#283338]">{question}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-8 pt-24">
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-xl bg-[#e4f0f1] p-8">
            <Pill>automate · 잡무 자동화</Pill>
            <h3 className="mb-4 font-serif text-[28px] font-semibold">읽기 주변부는 도구가 합니다</h3>
            <div className="grid gap-2.5">
              <CheckLine>PDF·링크·DOI만 넣으면 논문 정보를 자동으로 채워 줍니다</CheckLine>
              <CheckLine>내용이 잘 뽑혔는지 점수(0~100)로 알려 줍니다</CheckLine>
              <CheckLine>인용할 만한 문장을 한곳에 모아 둡니다</CheckLine>
              <CheckLine>파일로 내보내고, 쓰던 내용은 자동으로 저장됩니다</CheckLine>
            </div>
          </article>
          <article className="rounded-xl bg-[#e4f0f1] p-8">
            <Pill>synthesize · 종합</Pill>
            <h3 className="mb-4 font-serif text-[28px] font-semibold">읽은 것을 연구 질문으로</h3>
            <div className="grid gap-2.5">
              <CheckLine color="#16325a">저장한 논문을 목적별로 다시 모아 봅니다</CheckLine>
              <CheckLine color="#16325a">자주 나오는 한계에서 아직 풀리지 않은 문제를 찾습니다</CheckLine>
              <CheckLine color="#16325a">검증된 틀(FINER·PICOT·PESICO)로 연구 질문을 만듭니다</CheckLine>
              <CheckLine color="#16325a">정리한 내용이 어느 논문에서 왔는지 바로 찾아갑니다</CheckLine>
            </div>
            <button type="button" className="mt-5 rounded-full bg-[#16325a] px-5 py-2.5 text-sm font-medium text-white" onClick={start}>
              연구 질문 빌더 살펴보기
            </button>
          </article>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-8 pt-24">
        <div className="mb-11 text-center">
          <Pill>PRICING · 요금</Pill>
          <h2 className="font-serif text-[40px] font-normal leading-[1.2]">
            유료 가치는 "AI가 해 준다"가 아니라
            <br />
            <span className="font-semibold italic">"내 작업 방식에 맞는 도구"</span>입니다.
          </h2>
        </div>
        <div className="mx-auto grid max-w-[820px] gap-5 md:grid-cols-2">
          <article className="rounded-[14px] border border-[#e4f0f1] bg-white p-8">
            <div className="mb-2.5 text-[13px] uppercase tracking-[0.05em] text-[#0e4749]">Free</div>
            <div className="mb-5 font-serif text-[38px] font-semibold">무료</div>
            <div className="grid gap-2">
              <CheckLine color="#65b8a2">월 5편 리뷰 노트</CheckLine>
              <CheckLine color="#65b8a2">핵심 정리 기능 전부</CheckLine>
              <CheckLine color="#65b8a2">기본 템플릿 · 3단계 읽기 · 목차 이동</CheckLine>
            </div>
            <button type="button" className="mt-6 w-full rounded-full border border-[#0e4749] px-4 py-3 text-sm font-medium text-[#0e4749]" onClick={start}>
              무료로 시작
            </button>
          </article>
          <article className="relative rounded-[14px] bg-[#1c5d5f] p-8 text-white">
            <div className="absolute right-5 top-5 rounded-full bg-[#cae1e2] px-2.5 py-1 text-[10px] uppercase tracking-[0.05em] text-[#0e4749]">추천</div>
            <div className="mb-2.5 text-[13px] uppercase tracking-[0.05em] text-[#a2cbcd]">Pro</div>
            <div className="mb-5 font-serif text-[38px] font-semibold">
              9,900<span className="text-[17px] font-normal">원/월</span>
            </div>
            <div className="grid gap-2">
              <CheckLine color="#cae1e2" muted>리뷰 노트 무제한 · 목적 템플릿 전부(T2~T5)</CheckLine>
              <CheckLine color="#cae1e2" muted>시그널 스캐너 · 그림/표 바로가기</CheckLine>
              <CheckLine color="#cae1e2" muted>논문 모아보기 · 연구 질문 만들기</CheckLine>
              <CheckLine color="#cae1e2" muted>어려운 용어를 AI가 풀어서 설명</CheckLine>
            </div>
            <button type="button" className="mt-6 w-full rounded-full bg-white px-4 py-3 text-sm font-medium text-[#1c5d5f]" onClick={start}>
              Pro 시작하기
            </button>
          </article>
        </div>
      </section>

      <section id="paperlens-auth-panel" className="mx-auto max-w-[820px] px-8 pt-24">
        <div className="rounded-2xl border border-[#e4f0f1] bg-white p-6 shadow-sm">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0e4749]">SERVICE LOGIN</p>
            <h2 className="mt-1 font-serif text-[30px] font-semibold">
              {user ? '서비스 입장 준비 완료' : DEMO_AUTH_ENABLED ? '데모 계정으로 시작' : '로그인 후 서비스 시작'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#556]">
              {user
                ? '계정 인증이 완료되었습니다. 저장된 논문과 리뷰 노트를 바로 이어서 확인할 수 있습니다.'
                : DEMO_AUTH_ENABLED
                  ? '데모 계정 정보가 입력되어 있습니다. 로그인하면 샘플 PDF와 리뷰 노트 흐름을 확인할 수 있습니다.'
                  : '인증이 완료되면 논문 리뷰 서비스 화면으로 이동합니다.'}
            </p>
          </div>
          <AuthControls
            enabled={authEnabled}
            ready={authReady}
            user={user}
            initialEmail={DEMO_EMAIL}
            initialPassword={DEMO_PASSWORD}
            onEnterService={onEnterService}
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
      </section>

      <section className="mx-auto max-w-6xl px-8 py-24">
        <div className="relative overflow-hidden rounded-[18px] bg-[#16325a] px-8 py-16 text-center sm:px-12">
          <div className="absolute left-10 top-8 text-2xl text-[#65b8a2]">✦</div>
          <div className="absolute bottom-10 right-12 text-2xl text-[#d6aec1]">+</div>
          <h2 className="mb-4 font-serif text-[42px] font-normal leading-[1.2] text-white">
            읽기는 당신의 몫으로, <span className="font-semibold text-[#cae1e2]">나머지는 우리에게.</span>
          </h2>
          <p className="mx-auto mb-7 max-w-[520px] text-[17px] text-[#a2cbcd]">
            AI를 연결하지 않아도 목적 템플릿, 3단계 읽기, 바로가기, 시그널 스캐너, 모아보기, 연구 질문 만들기까지
            전부 그대로 쓸 수 있습니다.
          </p>
          <button type="button" className="rounded-full bg-white px-8 py-4 text-[15px] font-medium text-[#16325a]" onClick={start}>
            무료로 리뷰 노트 만들기
          </button>
        </div>
      </section>

      <footer className="border-t border-[#e4f0f1]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-8 py-9">
          <div className="flex items-center gap-2.5">
            <div className="size-[22px] rounded-md bg-[#1c5d5f]" />
            <span className="font-serif text-lg font-semibold">PaperLens</span>
          </div>
          <div className="text-xs tracking-[0.03em] text-[#8aa0a1]">논문 리뷰·정리 워크스페이스 · v4.0</div>
        </div>
      </footer>
    </main>
  );
}
