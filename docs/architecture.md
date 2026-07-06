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
- `frontend/src/components/App.tsx`: 랜딩/서비스 경로 분기와 인증 가드, `ReviewWorkspace` 조합(`WorkspaceContext` Provider). 패널은 직접 렌더하지 않고 아래 `workspace/` 컴포넌트로 위임
- `frontend/src/components/workspace/`: 워크스페이스 패널 분해
  - `WorkspaceContext.ts`: store를 공유하는 Context와 `useWorkspace()` 훅 (prop drilling 방지)
  - `WorkspaceHeader.tsx` · `UploadBar.tsx` · `PaperSidebar.tsx` · `SelectionToolbar.tsx`
  - `SourcePanel.tsx`: 원문/PDF 보기 토글, 원문 직접 편집, PDF 미리보기 로드 (패널 전용 상태·이펙트 보유)
  - `ReviewNotePanel.tsx`: 메타정보, 리뷰 로드맵, 수동 요약, 하이라이트, 인용 후보 보드, 용어 사전, 내보내기
- `frontend/src/components/LandingPage.tsx`: 사용설명서와 로그인 진입 화면
- `frontend/src/hooks/useReviewStore.tsx`: 등록, 업로드, 하이라이트, 용어 추가, AI 설명, 내보내기 액션 (`ReviewStore` 타입 export)
- `frontend/src/hooks/useReviewPersistence.ts`: 서버 저장, IndexedDB/localStorage 폴백, 재동기화, 수동 저장
- `frontend/src/lib/localReviewCache.ts`: 계정별 브라우저 임시 캐시. 노트/메타 스냅샷과 원문 텍스트를 분리 저장하고, IndexedDB 사용 불가 시 localStorage fallback
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
- `backend/app/routers/ai.py`: OpenRouter 기반 용어 설명 API. 인증 활성 시 토큰 요구 + 사용자별 분당 레이트리밋(`AI_RATE_LIMIT_PER_MINUTE`)
- `backend/app/repositories/`: SQLite/PostgreSQL 저장소 구현

## Main APIs

| API | 역할 |
| --- | --- |
| `GET /api/health` | 서버 상태 확인 |
| `GET /api/ai/status` | AI 보조 활성 상태 확인 |
| `POST /api/ai/term-explanation` | 용어 설명 초안 생성 |
| `POST /api/papers/extract-text` | PDF 업로드, 텍스트/메타데이터 추출 |
| `POST /api/papers/extract-url` | 공용 PDF URL 다운로드, SSRF 방어 후 텍스트/메타데이터 추출 |
| `GET /api/papers/{id}/pdf` | 저장된 PDF 원본 조회 |
| `GET /api/papers/metadata` | DOI 기반 CrossRef 메타데이터 조회 |
| `GET /api/research-doc` | 연구 질문 빌더 프로젝트 문서 조회(사용자당 1건) |
| `PUT /api/research-doc` | 연구 질문 문서 저장(last-write-wins) |
| `GET /api/notes` | 노트 목록 조회(본문 제외) |
| `GET /api/notes/{id}` | 단일 노트 조회 |
| `PUT /api/notes/{id}` | 노트 저장 |
| `DELETE /api/notes/{id}` | 노트 삭제 |

## PDF Processing

- 50MB 초과, 200페이지 초과, 암호 PDF를 서버에서 거절합니다.
- 원문 등록은 PDF 파일 업로드 또는 PDF로 바로 열리는 공용 인터넷 URL을 안정 경로로 사용합니다. 일반 웹페이지 URL은 원문 추출 대상으로 보지 않습니다.
- PDF URL 등록은 SSRF 방어를 위해 `http/https`만 허용하고, credentials 포함 URL, `localhost`, loopback, 사설망, link-local, multicast/reserved/unspecified IP, private IP로 해석되는 도메인, redirect 대상이 비공용 주소인 경우를 거절합니다. 사용자 PC의 로컬 PDF는 URL이 아니라 파일 업로드로 등록합니다.
- 텍스트가 없는 스캔 PDF는 등록은 허용하되 NAVER CLOVA OCR 재추출/직접 작성 안내를 표시합니다.
- PyMuPDF 추출 라인을 문단 단위로 재결합합니다.
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

## Browser Cache and Save Flow

프론트엔드는 서버 저장 실패, 네트워크 지연, 자동 저장 대기 중 탭 이동에 대비해 계정별 브라우저 캐시를 유지합니다.

- 기본 저장소는 IndexedDB(`paperlens-local-cache`)입니다. `snapshots`에는 라이브러리/노트/dirty 상태를 저장하고, `paperTexts`에는 PDF 원문 텍스트를 논문별로 분리 저장합니다.
- IndexedDB를 사용할 수 없는 브라우저에서는 계정별 localStorage fallback(`paperlens:cache:v2:*`)을 사용합니다. 기존 `paperlens:v1` 캐시는 최초 복원 시 새 캐시로 이관합니다.
- 자동 저장은 편집 중 5초 trailing debounce와 10초 max wait로 동작합니다. 사용자는 리뷰 패널의 `지금 저장` 버튼으로 대기 중 변경을 즉시 서버에 반영할 수 있습니다.
- 로그아웃 시 미동기 변경이나 저장 진행 중 상태가 있으면 먼저 서버 저장을 await합니다. 저장 성공 시에만 계정별 로컬 캐시를 삭제하고 로그아웃합니다. 저장 실패 시 기본적으로 로그아웃을 중단하며, 사용자가 선택하면 로컬 임시 저장본을 유지한 채 세션만 종료합니다.
- `pagehide`/`visibilitychange`에서는 best-effort로 로컬 캐시 저장과 `keepalive` 서버 요청을 수행하지만, 대용량 본문은 브라우저 제한이 있으므로 수동 저장과 로그아웃 전 저장 확인 흐름을 주 경로로 둡니다.
