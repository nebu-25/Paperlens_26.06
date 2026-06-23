# PaperLens

사용자가 직접 작성하는 논문 리뷰 노트 도구입니다. `paper_review_service_plan_v3.1.md` 기준으로 AI 없이 동작하는 코어 MVP를 먼저 개발하도록 환경을 분리했습니다.

## 현재 진행 사항

- `paper_review_service_plan_v3.1.md`를 기준으로 Phase 1 코어 MVP 개발 환경을 구성했습니다.
- 정본 화면은 `frontend/` React 앱으로 단일화했고, 기존 루트의 AI 자동 분석 데모는 `demo/index.html`로 옮겨 Phase 2 AI 보조 레이어 참고 자산으로 보존합니다.
- 프론트엔드는 기획서 화면 2(원문/리뷰 노트 좌우 2분할)와 리뷰 노트 9영역을 구현했습니다. 본문 드래그 → 하이라이트/용어 추가, 5초 자동 저장, AI 보조 버튼 "준비 중" 비활성 등 코어 UX가 AI 없이 동작합니다.
- 작업 화면 UX를 개선했습니다. 서비스명을 크게 노출하고, PDF 업로드·DOI/URL 등록 영역을 상단 중앙의 고정 영역으로 분리했습니다. 논문 등록 전 빈 화면은 사용 흐름 안내 화면으로 채웠고, 등록 후에는 원문 패널과 리뷰 노트 패널이 각각 독립 스크롤됩니다. 모바일·좁은 화면에서는 `논문`/`리뷰` 탭으로 전환해 사용합니다.
- 업로드 UX를 보강했습니다. PDF 업로드는 `업로드 중 → 텍스트 추출 중 → 메타정보 확인 중 → 노트 생성 중` 단계와 진행 바로 표시하고, 실패 원인은 원인별 배너로 안내합니다. DOI/URL로 만든 노트는 원문 패널에서 **PDF 본문 연결**로 현재 노트에 본문을 붙일 수 있으며, 저장 상태 영역은 리뷰 패널 상단에 고정 표시됩니다. 모바일에서는 논문이 열리면 상단 업로드 영역을 접어 작업 공간을 확보합니다.
- 하이라이트는 **원문 내 문자 오프셋(위치)과 색상으로 저장**되어, 원문 패널에 색상 마크로 영구 표시되고 재열람 시 복원됩니다(FS-02 위치 기반). 하이라이트 색상은 **노랑·초록·파랑·분홍·주황 5개**를 지원하며, 기존 색상 없는 하이라이트는 노랑으로 표시합니다. 원문 패널은 `pre-wrap` 단일 컨테이너로 렌더해 DOM 텍스트와 추출 본문이 1:1 일치합니다. 오프셋이 없는 옛 하이라이트는 **본문에서 텍스트를 찾아(첫 출현) 표시**합니다(비파괴). (실제 PDF 캔버스 뷰어 렌더는 후속 단계)
- 리뷰 노트는 **백엔드 SQLite에 영속 저장**됩니다(`/api/notes` CRUD). 시작 시 서버에서 복원하고, 5초 자동 저장 시 **변경된 모든 노트(dirty)를 `PUT`**합니다(노트 전환 시 직전 작성분 유실 방지). **탭 닫기·숨김 시에는 `keepalive`로 강제 저장**하여 마지막 편집을 보존합니다. 서버 미연결 시에는 **localStorage 캐시로 폴백**하여 코어가 계속 동작하며(헤더에 `서버 저장`/`로컬 저장(오프라인)`·`미동기 N건` 표시), 서버 복구 시 **미동기 노트를 자동 재동기화**(주기적 재시도 + `online` 이벤트)합니다. 사이드바에서 노트를 전환·삭제할 수 있습니다. (Phase 1은 노트를 JSON 문서로 저장하며, 전체 관계형 ERD·PostgreSQL 전환은 후속 작업)
- 지식베이스 검색·태그(FR-09): 노트별 **태그**를 달고, 사이드바에서 **검색**(제목·저자·태그뿐 아니라 작성 내용 전체 매칭)과 **태그 필터**(다중 선택 AND)로 저장된 노트를 빠르게 찾습니다. 태그는 노트와 함께 서버에 저장됩니다. (단일 사용자/로컬 데모 기준이며, 다중 사용자 인증·개인화는 후속 단계)
- 리뷰 노트 패널은 작성 흐름에 맞춰 **읽으며 캡처**(하이라이트·용어·질문·섹션 메모)와 **내 언어로 정리**(한 줄 요약·요약) 두 묶음으로 그룹화했습니다. 섹션별 요약과 5문항 템플릿은 **토글로 택1**(양쪽 데이터 보존), 각 영역은 **접기/펼치기**, 하단 **완성도 체크리스트**로 작성 진행도를 표시합니다.
- 완성한 리뷰 노트는 **Markdown 다운로드** 또는 **PDF로 저장**(인쇄 대화상자)으로 내보낼 수 있습니다(FR-11). 추가 라이브러리 없이 동작하며, 요약 토글과 무관하게 작성된 섹션별 요약·템플릿을 모두 포함합니다.
- 논문 메타정보 자동 추출(FR-02): DOI/URL 등록 시 **CrossRef** 조회, PDF 업로드 시 **본문 DOI 탐지 → CrossRef → arXiv API → 첫 페이지 레이아웃 → PDF 내장 메타데이터** 순으로 제목·저자를 채웁니다. 어느 단계에서도 비면 메타정보 영역에서 **제목·저자·링크를 직접 편집**할 수 있습니다(KCI 등 미등재 논문).
- PDF 메타정보 추출을 보강했습니다. DOI 탐색 범위를 PDF 내장 metadata와 본문으로 확장하고, CrossRef 응답의 `subject`·`container-title`을 **추천 태그**로 저장합니다. **arXiv 논문(CrossRef DOI 미존재)은 본문의 arXiv ID를 찾아 arXiv API로 제목·전체 저자·분류(`cs.CL` 등 → 추천 태그)를 정확히 가져옵니다.** DOI/arXiv 모두 실패하면(KCI 등 미등재) 첫 페이지 레이아웃(상단 큰 글자 블록과 그 아래 저자 후보)을 휴리스틱으로 분석해 제목·저자를 보완합니다. 저자 추정은 **제목 다음의 연속된 '저자처럼 보이는' 줄을 모으고**(소속·이메일·날짜·문장형 줄을 만나면 멈춤), **소속/각주 표식(∗ † ‡, 위첨자·소속 인덱스 숫자)을 떼어** 깔끔한 이름만 남깁니다. 한글 소속어(대학교·학과·연구소 등)와 **괄호 소속(`이승재 (경희대)` → `이승재`)**·**짧은 한글 이름(2~3자)**·한글/로마숫자 섹션 헤딩(`Ⅰ. 서론`)을 구분하므로 KCI 논문(예: `홍길동·김철수·이영희`)과 영문 논문 모두 다룹니다. 추출 결과는 `doi`, `suggestedTags`, `metadataSource`(`crossref`/`arxiv`/`layout`/`pdf`), `metadataConfidence`, `metadataWarnings`로 노트 저장 모델에 함께 보존됩니다.
- 섹션 자동 분류(FS-01): PDF 업로드 시 원문에서 **섹션 헤딩을 자동 추정**합니다. 번호가 붙은 헤딩(`1 Introduction`, `3.2 Multi-Head Attention`)과 표준 섹션 키워드(Abstract·Method·Result·Conclusion 등)를 인식해 정규화 카테고리로 매핑하고, 반복되는 머리글/꼬리글은 첫 등장만 남깁니다. 감지된 섹션은 `/api/papers/extract-text`의 `sections`(제목·정규화명·본문 오프셋)로 반환되어, 새 노트의 **섹션별 요약 카드를 자동 구성**합니다(2개 미만 감지 시 기본 섹션으로 폴백, 카드는 자유롭게 편집·삭제·추가 가능).
- PDF 본문 자연어 reflow: PDF는 시각적 줄마다 줄바꿈이 들어가(또는 줄마다 블록이 나뉘어) 문장이 토막난다. 추출 시 **줄(line)의 좌표·글자크기를 보고 한 문단에 속한 줄들을 이어 붙인다.** 문단 경계는 (a) 평소보다 큰 세로 간격, (b) 큰 글자(헤딩), (c) 작은(1~2 em) 들여쓰기로 판단하며, 수식·다열로 인한 큰 x 점프는 무시해 과편화를 막는다. 줄 잇기는 **라틴어는 공백 연결 + 하이픈 처리**(`represen-tation`→`representation`, `self-Attention` 유지), **한글 등 CJK는 공백 없이 연결**(어절 중간 줄바꿈으로 단어가 쪼개지는 것 방지: `번`+`역사`→`번역사`)한다. 구두점 앞 공백 제거·문장부호 뒤 공백 보강 등 정리도 한다. 읽기 흐름을 끊는 **페이지 번호·측면 arXiv 스탬프, 여러 페이지에 반복되는 러닝 헤더/푸터는 제외**한다. (DOM 텍스트 == `paper.text`라 하이라이트 문자 오프셋도 이 텍스트 기준으로 일관 유지)
- PDF 업로드 입력 가드(FS-01): **50MB·200페이지 초과**와 **암호 보호 PDF**는 오류로 거절하고, **스캔(이미지) PDF**는 텍스트가 없으면 OCR 안내를 표시합니다(등록은 진행, 노트 직접 작성 가능). 같은 PDF 파일은 파일명·크기·수정시간 기반 식별자로 중복 등록을 막고 기존 노트를 엽니다. 오류·안내는 상단 등록 영역의 배너로 노출됩니다.
- 백엔드는 FastAPI 기반으로, PDF 텍스트 추출(`/api/papers/extract-text`)·CrossRef 메타정보 조회(`/api/papers/metadata`)·리뷰 노트 영속화(`/api/notes` CRUD, SQLite) API를 제공합니다.
- 프론트는 API를 **상대경로 `/api`**로 호출합니다(개발 시 Vite 프록시, 배포 시 동일 오리진). 다른 오리진의 백엔드를 가리키려면 `frontend/.env`의 `VITE_API_BASE_URL`로 오버라이드합니다.
- 노트 목록(`GET /api/notes`)은 **본문(text)을 제외한 메타데이터**만 반환하고, 논문을 열 때 단건 조회(`GET /api/notes/{id}`)로 원문을 **지연 로드**합니다(목록 페이로드 경량화). 서버 시작은 FastAPI `lifespan`으로 DB를 초기화합니다.
- SQLite는 **WAL 저널 모드 + `busy_timeout`(기본 5초, `SQLITE_BUSY_TIMEOUT_MS`로 조정)**으로 연다. 잦은 자동 저장 `PUT`이 동시에 들어와도 읽기가 쓰기를 막지 않고, 잠금 경합 시 즉시 실패하는 대신 재시도해 `database is locked` 오류를 줄입니다(WAL 미지원 파일시스템에서는 안전하게 기존 모드 유지).
- AI 기능은 기획서 방향대로 미연동 상태를 전제로 두고, 코어 작성 UX가 먼저 동작하도록 구성했습니다.
- 프론트엔드를 **GitHub Pages**에, 백엔드를 **Render**에 분리 배포하여 웹에서 동작을 확인했습니다(라이브). 자세한 구성은 아래 "배포" 섹션을 참고하세요.
- 개발 서버 실행과 빌드/컴파일 검증을 완료했습니다. 검증 절차는 아래 "검증" 섹션을 참고하세요. (상세 실행 로그는 로컬 `testing.md`에 기록하며, 이 파일은 버전 관리에서 제외됩니다.)

## 프로젝트 구조

- `frontend/`: Vite + React 18 + TypeScript + Tailwind CSS (정본 화면)
- `backend/`: FastAPI + PyMuPDF 기반 PDF 텍스트 추출 API
- `demo/index.html`: 기존 AI 자동 분석 단일 파일 데모 (Phase 2 참고용)
- `paper_review_service_plan_v3.1.md`: 제품 기획서
- `testing.md`: 로컬 테스트·검증 기록 (버전 관리 제외, 각자 로컬에서 유지)

## 주요 추가 파일

- `frontend/package.json`: 프론트엔드 의존성 및 실행 스크립트
- `frontend/src/main.tsx`: 앱 엔트리(루트 렌더만 담당)
- `frontend/src/components/App.tsx`: 앱 화면(뷰) — 사이드바·업로드·원문/리뷰 2분할 렌더
- `frontend/src/hooks/useReviewStore.tsx`: 상태·서버/로컬 동기화·업로드/등록/하이라이트/내보내기 등 모든 액션 로직
- `frontend/src/lib/`: 순수 헬퍼 — `notes.ts`(노트 유틸·섹션 분류 매핑), `format.tsx`(표시 헬퍼), `export.ts`(Markdown/PDF)
- `frontend/src/types.ts`·`constants.ts`: 도메인 타입과 전역 상수
- `frontend/src/styles.css`: Tailwind 엔트리 스타일
- `backend/app/main.py`: FastAPI 앱 엔트리포인트
- `backend/app/routers/papers.py`: PDF 텍스트 추출·섹션 분류·메타 추출 API
- `backend/tests/`·`frontend/src/lib/*.test.ts`: 자동 테스트(pytest / Vitest)
- `backend/requirements.txt`: 백엔드 Python 의존성
- `.github/workflows/deploy-pages.yml`: 프론트엔드를 빌드해 GitHub Pages로 배포하는 워크플로
- `render.yaml`: 백엔드(FastAPI)를 Render에 배포하는 Blueprint
- `.gitignore`: 의존성, 빌드 산출물, 환경 변수 제외 설정

## 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

## 백엔드 실행

런타임 서버만 실행할 때는 `requirements.txt`만 설치합니다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

기본 API 주소는 `http://127.0.0.1:8000`입니다.

백엔드 테스트를 작성하거나 실행할 때는 `pyproject.toml`의 dev extra를 설치합니다.

```bash
cd backend
source .venv/bin/activate
pip install -e ".[dev]"
```

`fastapi.testclient.TestClient`는 FastAPI가 Starlette의 테스트 클라이언트를 편의상 다시 노출하는 API입니다. 현재 FastAPI/Starlette 조합에서는 Starlette `TestClient`가 `httpx2`를 요구하므로, 테스트용 의존성에만 `httpx2`를 둡니다. `httpx2`는 서버 실행에는 필요하지 않으므로 `requirements.txt`에는 추가하지 않습니다.

## API 확인

```bash
curl http://127.0.0.1:8000/api/health
```

예상 응답:

```json
{"status":"ok"}
```

## 배포

프론트엔드와 백엔드를 분리 배포합니다.

- **프론트엔드 — GitHub Pages**: https://nebu-25.github.io/Paperlens_26.06/
  - `.github/workflows/deploy-pages.yml`가 `main` push 시 `frontend`를 빌드해 Pages에 올립니다.
  - 서브경로 배포를 위해 `frontend/vite.config.ts`에 `base: '/Paperlens_26.06/'`를 설정했습니다.
  - 백엔드 주소는 코드에 박지 않고, 저장소 변수 `VITE_API_BASE_URL`(Settings → Secrets and variables → Actions → Variables)로 빌드 시 주입합니다(끝에 `/api`는 붙이지 않음 — 코드가 자동 추가).
  - Pages 소스는 **"GitHub Actions"**여야 합니다(Settings → Pages). 재배포 시 자동 생성되는 *"pages build and deployment"(Jekyll)* 워크플로는 실행하지 마세요 — README가 앱을 덮어씁니다.
- **백엔드 — Render**: 저장소 루트 `render.yaml`(Blueprint)로 배포합니다(무료 플랜).
  - start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health: `/api/health`.
  - 무료 플랜은 미사용 시 잠들어, 첫 요청에서 30~50초 콜드스타트가 발생할 수 있습니다.
  - SQLite(`paperlens.db`)는 무료 플랜에 영속 디스크가 없어 재배포/재시작 시 초기화될 수 있습니다.
  - CORS: `backend/app/config.py` 기본값과 Render 환경변수 `CORS_ORIGINS`에 Pages 오리진을 포함합니다.

> 로컬 개발에서는 프론트가 상대경로 `/api`를 Vite 프록시로 백엔드(`127.0.0.1:8000`)에 전달하므로 `VITE_API_BASE_URL` 없이 동작합니다. 위 변수는 Pages처럼 백엔드가 다른 오리진일 때만 필요합니다.

## 검증

아래 명령으로 빌드·컴파일을 검증할 수 있습니다. 상세 실행 로그는 로컬 `testing.md`에 정리하며, 이 파일은 버전 관리에서 제외됩니다(공유 대상 아님).

```bash
cd frontend
npm run lint
npm run build
npm test          # Vitest 단위 테스트 (lib 순수 로직)

cd ../backend
source .venv/bin/activate
python -m compileall app
pip install -e ".[dev]"   # 최초 1회: pytest 등 dev 의존성
pytest                    # papers.py 순수 함수(섹션 분류·DOI 추출 등) 테스트
```

### 자동 테스트 (#15)

- **프론트엔드 (Vitest)**: `src/lib/*.test.ts` — `lib/notes`(섹션 자동 분류 매핑·태그 병합·노트 정규화·검색 인덱스), `lib/export`(Markdown/PDF 빌드·HTML 이스케이프·파일명 보호)의 순수 로직을 검증합니다. DOM이 필요 없어 node 환경에서 실행합니다.
- **백엔드 (pytest)**: `backend/tests/test_papers.py` — DOI 추출/정규화, CrossRef 저자·태그 포맷, **섹션 헤딩 자동 분류**(`_detect_sections`/`_canonical_section`)의 인식·중복 제거·오탐 방지를 검증합니다(네트워크·PyMuPDF 비의존).
