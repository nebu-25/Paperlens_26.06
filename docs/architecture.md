# Architecture

PaperLens는 프론트엔드와 백엔드를 분리한 단일 사용자 중심 리뷰 도구입니다.

```text
React/Vite frontend
  -> relative /api requests
  -> Supabase Auth session
FastAPI backend
  -> PDF extraction and metadata APIs
  -> Notes repository
SQLite by default, PostgreSQL when DATABASE_URL is set
OpenRouter AI only when AI_API_KEY is set
```

## Frontend

- `frontend/src/main.tsx`: 앱 엔트리
- `frontend/src/components/App.tsx`: 랜딩/서비스 경로 분기, 사이드바, 업로드 영역, 원문 패널, 리뷰 노트 패널 렌더링
- `frontend/src/components/LandingPage.tsx`: 사용설명서와 로그인 진입 화면
- `frontend/src/hooks/useReviewStore.tsx`: 등록, 업로드, 하이라이트, 용어 추가, AI 설명, 내보내기 액션
- `frontend/src/hooks/useReviewPersistence.ts`: 서버 저장, localStorage 폴백, 재동기화
- `frontend/src/hooks/useAuthSession.ts`: Supabase session 구독
- `frontend/src/components/AuthControls.tsx`: 이메일/비밀번호, Google 로그인 UI
- `frontend/src/hooks/usePaperBodyNodes.tsx`: 하이라이트 오프셋을 원문 DOM 노드로 렌더링
- `frontend/src/lib/`: 순수 헬퍼와 테스트 대상 로직
- `frontend/src/types.ts`: 도메인 타입
- `frontend/src/constants.ts`: 하이라이트 색상, 업로드 단계, 템플릿 질문

프론트엔드는 기본적으로 상대경로 `/api`를 호출합니다. 로컬 개발에서는 Vite 프록시가 `127.0.0.1:8000`으로 전달하고, Pages 배포에서는 `VITE_API_BASE_URL`로 Render 백엔드 주소를 주입합니다.

GitHub Pages 배포의 경로 구성은 아래와 같습니다.

- `/Paperlens_26.06/`: 로그인 랜딩 페이지
- `/Paperlens_26.06/service_home/`: 리뷰 워크스페이스
- `service_home/index.html`: 직접 접근 시 200 응답을 위한 정적 사본
- `404.html`: 기타 SPA fallback

## Backend

- `backend/app/main.py`: FastAPI 앱, lifespan DB 초기화, 라우터 등록
- `backend/app/config.py`: CORS, CrossRef, AI 설정
- `backend/app/auth.py`: Supabase JWT 검증, Supabase user endpoint fallback, 요청 사용자 id 추출
- `backend/app/routers/papers.py`: PDF 업로드, 텍스트 추출, 섹션 감지, DOI/CrossRef/arXiv/레이아웃 메타데이터 추정
- `backend/app/routers/notes.py`: 노트 CRUD
- `backend/app/routers/ai.py`: OpenRouter 기반 용어 설명 API
- `backend/app/repositories/`: SQLite/PostgreSQL 저장소 구현

## Main APIs

| API | 역할 |
| --- | --- |
| `GET /api/health` | 서버 상태 확인 |
| `GET /api/ai/status` | AI 보조 활성 상태 확인 |
| `POST /api/ai/term-explanation` | 용어 설명 초안 생성 |
| `POST /api/papers/extract-text` | PDF 업로드, 텍스트/메타데이터 추출 |
| `POST /api/papers/extract-url` | PDF 원문 URL 다운로드, 텍스트/메타데이터 추출 |
| `GET /api/papers/{id}/pdf` | 저장된 PDF 원본 조회 |
| `GET /api/papers/metadata` | DOI 기반 CrossRef 메타데이터 조회 |
| `GET /api/notes` | 노트 목록 조회(본문 제외) |
| `GET /api/notes/{id}` | 단일 노트 조회 |
| `PUT /api/notes/{id}` | 노트 저장 |
| `DELETE /api/notes/{id}` | 노트 삭제 |

## PDF Processing

- 50MB 초과, 200페이지 초과, 암호 PDF를 서버에서 거절합니다.
- 원문 등록은 PDF 파일 업로드 또는 PDF로 바로 열리는 URL을 안정 경로로 사용합니다. 일반 웹페이지 URL은 원문 추출 대상으로 보지 않습니다.
- 텍스트가 없는 스캔 PDF는 등록은 허용하되 OCR/직접 작성 안내를 표시합니다.
- PyMuPDF 추출 라인을 문단 단위로 재결합합니다.
- 2단 컬럼이 감지되면 페이지의 왼쪽 컬럼을 먼저 읽고 오른쪽 컬럼으로 넘어가도록 읽기 순서를 보정합니다. 전체 폭 제목/표제 줄은 컬럼 본문 앞뒤로 유지합니다.
- 라틴어 줄바꿈과 하이픈을 보정하고, CJK 줄바꿈은 불필요한 공백을 줄입니다.
- 페이지 번호, 반복 헤더/푸터, 측면 arXiv 스탬프를 노이즈로 제거합니다.
- 수식/특수기호 깨짐이 의심되면 경고와 샘플을 반환합니다.

## Metadata Strategy

PDF 업로드 시 메타데이터는 아래 순서로 보완합니다.

1. PDF 내장 metadata와 본문에서 DOI 탐지
2. CrossRef 조회
3. arXiv ID 탐지 및 arXiv API 조회
4. 첫 페이지 레이아웃 기반 제목/저자 후보 추정
5. PDF 내장 title/author
6. 파일명 fallback

KCI 등 CrossRef 미등재 논문을 위해 레이아웃 휴리스틱은 한글 소속어, 괄호 소속, 이메일, 날짜, 섹션 헤딩, 제목형 문구를 저자 후보에서 제외합니다. 추출 결과는 `metadataSource`, `metadataConfidence`, `metadataWarnings`, `suggestedTags`로 함께 저장됩니다.

DOI 입력은 메타데이터 등록용입니다. DOI만으로는 원문 PDF를 보장하지 않으므로, 원문/뷰어 연결은 PDF 업로드 또는 PDF 원문 URL 입력으로 처리합니다.

## Export

리뷰 노트 내보내기는 작성된 내용을 섹션별로 보존하는 것을 우선합니다.

- Markdown 내보내기는 논문 메타데이터, 질문, 용어, 하이라이트, 메모, 요약 템플릿 답변을 포함합니다.
- 하이라이트는 색상 값에 연결된 의미 라벨(핵심, 방법, 결과, 한계, 질문)별로 그룹화해 출력합니다.
- 브라우저 인쇄 기반 PDF HTML도 같은 라벨 그룹을 사용하고, 하이라이트 색상별 class를 적용합니다.

## Storage

로컬 기본값은 SQLite입니다. `DATABASE_URL`이 있으면 PostgreSQL 저장소를 사용합니다. 저장소 API는 `{ paper, note }` 문서 형태를 유지하지만, DB 내부 저장은 접근 패턴별로 분리합니다.

분리 테이블:

- `paper_metadata`: 제목, 저자, DOI, source key, 메타데이터 경고, PDF 파일명 등 목록/검색에 필요한 가벼운 정보
- `paper_texts`: 원문 텍스트. 목록 조회에서는 읽지 않고 단일 노트 조회에서만 지연 로드
- `review_notes`: 리뷰 노트 JSON. 하이라이트, 태그, 질문, 템플릿 답변을 저장
- `paper_files`: PDF 파일명과 PDF 바이너리

기존 단일 `papers` 테이블이 있는 DB는 앱 시작 시 위 분리 테이블로 복사됩니다. 레거시 테이블은 즉시 삭제하지 않아 백업/롤백 여지를 남깁니다. 하이라이트/태그/리뷰 섹션의 관계형 정규화는 후속 단계로 남겨둡니다.

SQLite는 WAL 저널 모드와 `busy_timeout`을 사용해 자동 저장 중 잠금 충돌을 줄입니다. WAL을 지원하지 않는 파일시스템에서는 기존 모드로 안전하게 동작합니다.

Supabase Auth가 설정된 환경에서는 프론트엔드가 Supabase access token을 `Authorization: Bearer ...`로 FastAPI에 전달합니다. FastAPI는 HS256 토큰을 `SUPABASE_JWT_SECRET`으로 직접 검증합니다. 다른 서명 알고리즘이면 Supabase `/auth/v1/user`에 token과 `SUPABASE_ANON_KEY`를 보내 사용자 id를 확인합니다. 확인된 `user_id`로 노트·PDF 조회/저장/삭제를 해당 사용자 데이터로 제한합니다. Supabase 설정이 없는 로컬 환경에서는 `local` 사용자로 기존 단일 사용자 흐름을 유지합니다.
