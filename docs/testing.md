# Testing

이 문서는 재현 가능한 검증 명령과 자동 테스트 범위를 정리합니다. 날짜별 실행 로그는 로컬 `testing.md`에 기록하며, 해당 파일은 버전 관리에서 제외합니다.

## Frontend

```bash
cd frontend
npm run lint
npm test
npm run build
```

테스트 범위:

- `frontend/src/lib/notes.test.ts`: 노트 정규화, 섹션 분류 매핑, 태그 병합, 검색 인덱스
- `frontend/src/lib/library.test.ts`: 라이브러리 검색과 태그 필터
- `frontend/src/lib/export.test.ts`: Markdown/PDF HTML 생성, HTML escape, 파일명 보호
- `frontend/src/lib/localReviewCache.test.ts`: 계정별 브라우저 캐시 fallback, 원문 텍스트 분리 저장/복원, 캐시 삭제
- `frontend/src/lib/reviewProgress.test.ts`: 리뷰 진행률 체크리스트
- `frontend/src/hooks/useReviewStore.test.ts`: 핵심 상태/액션(논문 누적 등록, 태그 갱신, 하이라이트/용어 추가, 태그 필터, 삭제, 로컬 파일 경로 안내, 차단된 PDF URL 처리)
- `frontend/src/components/NoticeBanner.test.tsx`: 알림 배너 접근성(심각도별 role/aria-live, 색상 비의존 접두사)

순수 로직(`lib/*`)은 node 환경에서 돌고, DOM/컴포넌트 테스트는 파일 상단 `// @vitest-environment happy-dom` 도크블록으로 개별 전환합니다(devDep: `@testing-library/react`, `happy-dom`).

## Backend

최초 1회 dev extra를 설치합니다.

```bash
cd backend
source .venv/bin/activate
pip install -e ".[dev]"
```

검증:

```bash
python -m compileall app
pytest
```

테스트 범위:

- `backend/tests/test_papers.py`: DOI 정규화, CrossRef/arXiv 파싱, 섹션 감지, PDF reflow, 깨진 텍스트 감지, OCR fallback, 한국 논문 저자/소속 휴리스틱, PDF URL SSRF 방어(사설 IP/DNS/redirect 차단)
- `backend/tests/test_ai.py`: AI 미설정 응답, 용어 설명 endpoint 503, OpenRouter 응답 파싱, 사용자별 레이트리밋(429/Retry-After·사용자 격리)
- `backend/tests/test_auth.py`: Supabase JWT 검증(서명·exp·sub·`aud`·`iss`), `/auth/v1/user` fallback과 캐시
- `backend/tests/test_diagnostics.py`: 진단 endpoint
- `backend/tests/test_db.py`: 저장소 facade와 SQLite CRUD/마이그레이션. PostgreSQL 라운드트립 통합 테스트(`TestPostgreSQLRoundTrip`)는 `PAPERLENS_TEST_DATABASE_URL`이 있을 때만 실행되고, 없으면 skip

PostgreSQL 통합 테스트를 로컬에서 돌리려면 Postgres를 띄우고 연결 문자열을 주입합니다.

```bash
docker compose -f docker-compose.postgres.yml up -d
cd backend
PAPERLENS_TEST_DATABASE_URL=postgresql://paperlens:paperlens_dev@127.0.0.1:5432/paperlens pytest tests/test_db.py
```

## Local API Smoke

백엔드를 실행한 뒤 별도 터미널에서 실행합니다.

```bash
cd backend
uvicorn app.main:app --reload
```

```bash
curl http://127.0.0.1:8000/api/health

cd backend
API_BASE_URL=http://127.0.0.1:8000 python scripts/smoke_api.py
```

예상 health 응답:

```json
{"status":"ok"}
```

## PostgreSQL Smoke

```bash
docker compose -f docker-compose.postgres.yml up -d

cd backend
DATABASE_URL=postgresql://paperlens:paperlens_dev@127.0.0.1:5432/paperlens python scripts/smoke_postgres.py
```

## Deployment Smoke

```bash
python3 backend/scripts/smoke_deployment.py
```

GitHub Actions의 `Production smoke` 워크플로도 같은 검사를 수행합니다. 수동 실행할 수 있고, GitHub Pages 배포 성공 후 자동으로 실행됩니다. Render 무료 플랜은 콜드스타트가 있을 수 있으므로 첫 health 요청은 느릴 수 있습니다.

운영 로그인 플로우까지 자동 확인하려면 mock 계정을 만들고 GitHub repository secrets에 아래 값을 등록합니다. secret이 비어 있으면 workflow는 공개 endpoint만 확인합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PAPERLENS_SMOKE_EMAIL`
- `PAPERLENS_SMOKE_PASSWORD`

mock 계정 생성:

```bash
SUPABASE_SERVICE_ROLE_KEY=... \
PAPERLENS_SMOKE_EMAIL=paperlens-smoke@example.com \
PAPERLENS_SMOKE_PASSWORD='...' \
python3 backend/scripts/create_supabase_smoke_user.py
```

`SUPABASE_SERVICE_ROLE_KEY`가 없으면 스크립트는 `SUPABASE_ANON_KEY`로 공개 signup을 시도합니다. 이 경우 Supabase 프로젝트에서 이메일 가입이 열려 있고 이메일 확인 없이 로그인 가능한 설정이어야 합니다.

로그인 포함 운영 smoke:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... \
PAPERLENS_SMOKE_EMAIL=paperlens-smoke@example.com \
PAPERLENS_SMOKE_PASSWORD='...' \
python3 backend/scripts/smoke_deployment.py
```

### 운영 체크리스트

자동 확인:

- GitHub Pages 루트가 200을 반환한다.
- `/service_home` 직접 접근이 `/service_home/`로 301 redirect된 뒤 200을 반환한다.
- `/service_home/`가 200을 반환한다.
- `favicon.svg`가 200과 `image/svg+xml`을 반환한다.
- Render `/api/health`가 `{"status":"ok"}`를 반환한다.
- Render `/api/diagnostics`가 비밀값 없이 Auth/DB/AI 설정 상태를 반환하고, 운영 Auth가 `mode: supabase`, `ready: true`로 표시된다.
- Render `/api/ai/status`가 AI 사용 가능 여부 JSON을 반환한다.
- 미인증 `/api/notes`가 401과 로그인 필요 메시지를 반환한다.
- `/api/papers/sample-pdf` HEAD 요청이 200, `application/pdf`, PDF 파일명을 반환한다.
- mock 계정 secret이 설정되어 있으면 Supabase password login이 성공하고 인증된 `/api/notes`가 200 및 `{ library, notes }` 객체를 반환한다.

로그인 세션 필요:

- 로그인 후 복원된 논문이 있으면 추가 업로드 없이 첫 논문 또는 마지막 활성 논문이 바로 열린다.
- 샘플 PDF 버튼으로 PDF 다운로드, 텍스트 추출, 새 리뷰 노트 생성까지 완료된다.
- 샘플 PDF를 다시 눌러도 새 샘플 노트를 만들지 않고 기존 샘플 리뷰 노트를 연다.
- 샘플 PDF 처리 중 진행 상태가 백엔드 확인, 다운로드, 분석, 노트 생성 단계로 바뀌고 취소 버튼이 동작한다.
- 샘플 PDF 실패 안내에서 재시도 버튼으로 같은 흐름을 다시 시작할 수 있다.
- 등록된 PDF 원본 보기에서 `/api/papers/{id}/pdf` 401 콘솔 오류가 반복되지 않는다.
- DOI 또는 PDF 원문 URL 등록이 성공하거나, 조회 실패 시 원인별 안내가 표시된다.
- DOI 예: `10.9718/JBER.2026.47.1.11` 등록 시 CrossRef 조회 실패 여부와 관계없이 DOI가 보존되고, 원문 PDF는 별도 연결이 필요하다는 안내가 표시된다.
- arXiv PDF URL 예: `https://arxiv.org/pdf/2604.04977v1` 등록 시 PDF 다운로드, 텍스트 추출, 원본 보기까지 연결된다.
- 로그아웃 후 `/service_home/`에 접근하면 서비스 화면 대신 루트 랜딩으로 돌아간다.
- 서버 지연 또는 인증 실패 시 저장 상태가 `인증 확인 필요`, `서버 준비 중`, `로컬 저장 중` 중 하나로 구분된다.

### 2026-07-06 운영 로그인 smoke 준비

반영:

- `backend/scripts/smoke_deployment.py`가 `PAPERLENS_SMOKE_EMAIL/PASSWORD`와 `SUPABASE_URL/ANON_KEY`를 받으면 Supabase password login 후 인증된 `/api/notes` 200 및 `{ library, notes }` 복원 형태를 확인한다.
- GitHub Actions `Production smoke` workflow에 위 secret 주입 지점을 추가했다. secret이 비어 있으면 기존 공개 endpoint smoke만 수행한다.
- `backend/scripts/create_supabase_smoke_user.py`를 추가해 service role admin 생성 또는 anon signup으로 mock 계정 생성을 재현할 수 있게 했다.

실행 결과:

- `paperlens.codex.smoke@gmail.com` 계정은 anon signup으로 생성 요청이 성공했다.
- 같은 계정으로 password login을 시도하면 Supabase가 `email_not_confirmed`를 반환한다. 현재 운영 설정에서는 이 계정을 자동 smoke에 쓰려면 Supabase 대시보드에서 이메일 확인 처리하거나 `SUPABASE_SERVICE_ROLE_KEY`로 admin 생성 경로를 다시 실행해야 한다.
- Supabase SQL 편집기에서 mock 계정을 확인 완료 상태로 조정한 뒤, 같은 계정으로 `backend/scripts/smoke_deployment.py`를 실행해 운영 인증 smoke가 통과했다: `Production deployment smoke passed ... (with authenticated notes check)`.
- GitHub repository secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PAPERLENS_SMOKE_EMAIL`, `PAPERLENS_SMOKE_PASSWORD`를 등록한 뒤 `Production smoke` workflow를 브랜치 기준으로 수동 실행했다. Run `28748255495`가 통과했고 로그에서 `with authenticated notes check`를 확인했다.

## Demo Account Reset

예비 사용자를 위한 공용 데모 계정은 세션 단위로 지우지 않고, 매일 04:00 KST에 기본 샘플 노트 상태로 되돌립니다. 리셋은 데모 계정의 모든 노트를 삭제한 뒤 `demo-paperlens-quickstart` 샘플 노트 1개를 다시 저장하고, 하이라이트 오프셋이 원문 텍스트와 일치하는지 검증합니다.

필요한 GitHub repository secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PAPERLENS_DEMO_EMAIL`
- `PAPERLENS_DEMO_PASSWORD`

로컬 수동 실행:

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... \
PAPERLENS_DEMO_EMAIL=paperlens.demo.user@gmail.com \
PAPERLENS_DEMO_PASSWORD='...' \
python3 backend/scripts/reset_demo_account.py
```

GitHub Actions `Reset demo account` workflow는 수동 실행과 cron 실행을 모두 지원합니다.

### 2026-06-26 운영 실행 기록

실행 환경: Codex workspace, 네트워크 권한 허용 후 실행.

자동 확인 결과:

- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/`: 200 OK.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/`: 200 OK.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg`: 200 OK, `content-type: image/svg+xml`.
- `curl https://paperlens-backend-53ki.onrender.com/api/health`: 32초 후 `{"status":"ok"}`. Render 콜드스타트 또는 첫 요청 지연 재현.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home`: 301 to `/service_home/`, 이후 200 OK.
- `curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf`: 200 OK, `content-type: application/pdf`, `content-disposition`에 샘플 PDF 파일명 반환. 실제 샘플 파일명은 `2604.04977v1.pdf`.
- `curl -i https://paperlens-backend-53ki.onrender.com/api/notes`: 401, `{"detail":"로그인이 필요합니다."}`.
- `curl https://paperlens-backend-53ki.onrender.com/api/ai/status`: `{"enabled":true,"provider":"openrouter","model":"openai/gpt-5.2"}`.

후속 조치:

- 실패 빈도 기준으로는 인증 자체 실패보다 Render 첫 요청 지연이 가장 뚜렷했다.
- 저장 UX는 `/api/notes` 401, 503, 네트워크 실패를 구분해 안내하도록 개선했다.
- 샘플 PDF UX는 `/api/health`로 백엔드를 먼저 깨운 뒤 sample-pdf를 호출하고, 대기/재시도 안내를 표시하도록 개선했다.

### 2026-06-26 기능 안정화 검증

실행한 로컬 검증:

- `cd frontend && npm run lint`: 통과.
- `cd frontend && npm run build`: 통과.
- `backend/.venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_diagnostics.py backend/tests/test_papers.py`: 69 passed.

반영된 안정화 범위:

- 로그인 후 복원된 논문이 있으면 마지막 활성 논문 또는 첫 논문을 추가 업로드 없이 연다.
- PDF 원본 보기는 Bearer token으로 PDF를 fetch한 뒤 blob URL로 iframe에 표시한다. 실패 시 하이라이트 가능한 원문은 유지하고 fallback 안내를 표시한다.
- 샘플 PDF는 `sample:paperlens` sourceKey로 중복 등록을 막고, 파일명은 `2604.04977v1.pdf` 기준으로 보정한다.
- DOI 입력은 메타데이터 등록용으로 안내하고, PDF 파일 또는 PDF 원문 URL을 원문/뷰어 연결 경로로 사용한다.
- PDF 원문 URL은 `/api/papers/extract-url`로 다운로드해 기존 PDF 추출 파이프라인과 같은 방식으로 저장/추출한다.

운영에서 아직 다시 확인할 항목:

- GitHub Pages와 Render가 최신 커밋으로 배포된 뒤 위 로그인 세션 필요 항목을 브라우저에서 재확인한다.
- `/api/papers/extract-url`은 인증이 필요한 POST endpoint이므로 운영 확인은 로그인된 프론트 화면에서 수행한다.

### 2026-06-26 운영 smoke 재확인

실행 환경: Codex workspace, 2026-06-26 17:49 KST 전후, 네트워크 권한 허용 후 실행.

자동 확인 결과:

- `curl -sL https://nebu-25.github.io/Paperlens_26.06/`: 배포 HTML이 `/Paperlens_26.06/assets/index-DGegoMry.js`와 `/Paperlens_26.06/assets/index-BoORSe8-.css`를 참조했다. 당시 로컬 `frontend/dist`의 해시와 일치해 GitHub Pages가 최신 배포 번들을 가리키는 것을 확인했다.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/`: 200 OK.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home`: 301 to `/service_home/`, 이후 200 OK.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/`: 200 OK.
- `curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg`: 200 OK, `content-type: image/svg+xml`.
- `curl https://paperlens-backend-53ki.onrender.com/api/health`: 약 30초 후 `{"status":"ok"}`. Render 콜드스타트 지연이 다시 재현됐다.
- `curl https://paperlens-backend-53ki.onrender.com/api/diagnostics`: `auth.mode: supabase`, `auth.ready: true`, `auth.warnings: []`, `database.mode: postgresql`, `ai.enabled: true`, `ai.model: openai/gpt-5.2`.
- `curl -i https://paperlens-backend-53ki.onrender.com/api/notes`: 401, `{"detail":"로그인이 필요합니다."}`.
- `curl https://paperlens-backend-53ki.onrender.com/api/ai/status`: `{"enabled":true,"provider":"openrouter","model":"openai/gpt-5.2"}`.
- `curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf`: 200 OK, `content-type: application/pdf`, `content-disposition: attachment; filename="2604.04977v1.pdf"`.

미확인 항목:

- 실제 로그인 후 `/api/notes` 200 여부, 저장된 논문 자동 열기, 샘플 PDF 버튼의 브라우저 단계별 UI, 중복 샘플 열기, PDF 원본 보기의 콘솔 오류 여부, DOI/PDF URL/일반 웹 URL 입력 UX, 로그아웃 후 라우팅은 운영 계정 세션이 필요해 이번 CLI smoke에서는 확인하지 못했다.

추가 로컬 검증:

- `cd frontend && npm run lint`: 통과.
- `cd frontend && npm run build`: 통과. 새 로컬 번들은 `index-CQZpRkzs.js`, `index-BY1-hYY8.css`.
- `backend/.venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_diagnostics.py backend/tests/test_papers.py`: 69 passed.

### 2026-06-26 웹 번역/하이라이트 안정화 검토

재현 비교:

- 현재 버전 dev server: `http://localhost:5173/Paperlens_26.06/`.
- 2026-06-25 02:30 KST 기준 비교 worktree: `/tmp/Paperlens_20250625_0230`, dev server `http://localhost:5174/Paperlens_26.06/`.
- 기준 커밋은 `568e646`이며, 직후 `982cef5`는 README만 변경한 문서 커밋이라 앱 동작 비교 기준은 동일하다.

확인한 증상:

- 두 버전 모두 브라우저 웹 번역을 켠 상태에서 하이라이트 작업 또는 대기 중 React DOM commit 오류가 발생할 수 있었다.
- 최신 버전 오류 예: `removeChild`의 `NotFoundError`, `<Text>` component stack.
- 오래된 버전 오류 예: `insertBefore`의 `NotFoundError`, `<mark>` component stack.
- 결론: 특정 최신 커밋 회귀라기보다, 브라우저 번역기가 React가 관리하는 원문/하이라이트 DOM을 직접 바꾸면서 React의 예상 DOM 구조와 실제 DOM 구조가 어긋나는 문제다.

반영한 대응:

- 하이라이트 가능한 원문 영역에 `notranslate` class와 `translate="no"`를 적용해 브라우저 번역기가 React 하이라이트 DOM을 직접 바꾸지 못하게 했다.
- 일반 텍스트 조각을 직접 text node로 두지 않고 안정적인 `span`으로 감싸도록 조정했다.
- 선택 offset 계산 실패 시 하이라이트 저장 대신 경고를 띄우도록 방어했다.
- 앱 렌더 전 DOM mutation guard를 설치하고, 렌더 오류 발생 시 빈 화면 대신 복구 화면을 띄우는 ErrorBoundary를 추가했다.

사용상 주의:

- 현재 안정화 방향은 "웹 번역된 본문 위에서 직접 하이라이트"를 계속 지원하는 것이 아니라, 하이라이트 가능한 원문 DOM을 번역 대상에서 제외해 빈 화면 오류를 막는 쪽이다.
- 번역과 하이라이트를 모두 안정적으로 지원하려면 원문 하이라이트 패널은 `notranslate`로 보호하고, 별도 번역 보기 패널을 제공하는 구조가 필요하다.

저장 재시도 관련 확인:

- 오래된 버전은 `/api/notes` 서버 복원이 실패하면 로컬 캐시의 모든 논문을 미동기 변경분으로 표시해, 사용자가 작업하지 않아도 10초마다 `PUT /api/notes/{id}`를 재시도했다.
- 현재 버전은 `dirtyIds`를 로컬 저장소에 별도로 저장하고, 서버 복원 실패 후에도 실제 미동기 ID만 재시도하도록 변경했다.
- 따라서 로컬 캐시를 보기만 하는 상황에서 불필요한 PUT 루프가 발생하지 않아야 한다.

실행한 로컬 검증:

- `cd frontend && npm run lint`: 통과.
- `cd frontend && npm run build`: 통과.
- `git diff --check`: 통과.

### 2026-06-26 저장 성능/스키마 분리 검증

반영한 범위:

- 프론트는 `localStorage` 캐시를 먼저 표시하고 서버 `/api/health`, `/api/notes` 동기화는 백그라운드로 수행한다.
- 일반 자동 저장 PUT payload에서는 큰 `paper.text`를 제외하고, 새 PDF/본문 연결처럼 원문 저장이 필요한 경우에만 본문을 포함한다.
- 저장 재시도는 실패 직후 10초 고정 반복 대신 최대 5분까지 늘어나는 backoff를 사용한다.
- SQLite/PostgreSQL 저장소는 내부 테이블을 `paper_metadata`, `paper_texts`, `review_notes`, `paper_files`로 분리한다.
- 기존 단일 `papers` 테이블은 앱 시작 시 분리 테이블로 복사하고 자동 삭제하지 않는다.

실행한 로컬 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_db.py`: 10 passed.
- `backend/.venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_diagnostics.py backend/tests/test_papers.py`: 69 passed.

운영 확인 필요:

- 배포 전 PostgreSQL snapshot 또는 `pg_dump "$DATABASE_URL" > paperlens-backup.sql` 백업.
- Render에서 실제 운영 `DATABASE_URL` 값을 다시 확인해야 한다. 사용자가 다른 값을 복사해 `psql`이 로컬 socket으로 접속하려던 상황이 있었으므로, 다음 세션에서 `paperlens-backend > Environment` 또는 PostgreSQL 리소스의 External Database URL을 확인한다.
- 배포 후 `/api/diagnostics`, 로그인 복원, 샘플 PDF 등록, PDF 원문 URL 등록, 기존 노트 조회, PDF 원본 보기 확인.

### 2026-06-27 운영 PostgreSQL 스키마 분리 배포

실행 환경: 사용자 WSL 터미널, Render 대시보드, Neon PostgreSQL.

진행 결과:

- Render `paperlens-backend > Environment`의 실제 `DATABASE_URL`을 기준으로 Neon 운영 DB 연결을 확인했다.
- `psql "$DATABASE_URL"`이 로컬 socket으로 접속하던 문제는 현재 셸의 `DATABASE_URL`이 비어 있었기 때문으로 확인했다.
- 운영 DB에 대해 `pg_dump "$DATABASE_URL" > paperlens-backup.sql` 백업을 생성했다. 백업 파일은 Git에 커밋하지 않는다.
- 배포 중 기존 `papers` 2건 중 1건의 `user_id`가 `NULL`이라 `paper_metadata.user_id UUID NOT NULL` 복사에서 startup 실패가 발생했다.
- `3e12b9c Skip orphaned legacy rows in Postgres migration`에서 `user_id IS NOT NULL`인 legacy row만 분리 테이블로 복사하도록 수정하고 배포했다.
- 배포 후 `paper_metadata`, `paper_texts`, `review_notes`, `paper_files` 테이블 생성이 확인됐다. 기존 `papers` 테이블은 보존됐다.
- 데이터 수는 `papers=2`, `paper_metadata=1`, `review_notes=1`, `paper_texts=1`로 확인됐다. `user_id NULL` legacy row는 소유자를 확정할 수 없어 새 테이블로 복사하지 않고 `papers`에만 남긴다.
- `/api/diagnostics`는 `auth.ready: true`, `database.mode: postgresql`, `ai.enabled: true` 상태를 반환했다.
- 로그인 후 기존 저장 내용이 빠르게 로드되고, 메모/태그 변경 후 새로고침해도 그대로 복원됨을 확인했다.

운영 브라우저 수동 확인:

- 이미 등록된 샘플 PDF 버튼은 새 노트를 만들지 않고 기존 샘플 리뷰 노트를 열며 알림을 표시했다.
- DOI 입력은 정상 등록되고, 원문 연결 안내가 표시됐다.
- 일반 웹페이지 URL 입력 시 `PDF 원문 URL이 필요합니다` 안내가 표시되고 잘못된 노트가 생성되지 않았다.
- `c7bd50f Avoid metadata lookup for generic URLs` 배포 후 일반 웹페이지 URL 입력 시 안내는 유지되고 `/api/papers/metadata?...` 400 콘솔 오류는 발생하지 않았다.
- 로그아웃 후 `/service_home/` 접근 시 랜딩으로 돌아가고 로그아웃된 로그인 창이 표시됐다.

### 2026-06-27 PDF 추출 품질/레이아웃 개선 및 원문 직접 입력

반영한 범위:

- PDF 추출 품질 경고를 추가했다. 추출량이 매우 적거나, 헤더/푸터 일부만 잡힌 듯하거나, 숫자/기호 비율이 높거나, 깨진 문자가 많은 경우 `metadataWarnings`와 `notice`로 안내한다.
- 품질이 낮아도 추출된 텍스트를 비우지 않고 보존한다. `ad51797 Detect sparse PDF text extraction`에서 sparse 추출을 스캔으로 판정해 원문 패널이 비는 문제가 있어 `ccc468e Revert "Detect sparse PDF text extraction"`로 되돌렸다.
- `- 346 -` 같은 하이픈 포함 페이지 번호를 noise로 제거한다.
- PDF 레이아웃을 1단, 2단, 상단 1단+하단 2단 혼합형으로 명시 판정하는 `_detect_column_layout`을 추가했다.
- 혼합형에서는 상단 제목/저자/초록/키워드 영역을 먼저 읽고, 하단 2단 본문은 왼쪽 컬럼 전체 후 오른쪽 컬럼 순서로 읽는다.
- 중앙 정렬 제목/저자 같은 좁은 라인이 2단 컬럼 anchor 계산을 흐리지 않도록, 실제 좌우 컬럼이 동시에 나타나는 y좌표 아래 본문 라인만으로 split 기준을 다시 계산한다.
- 원문 패널에 `텍스트 편집`/`직접 입력` 기능을 추가했다. 자동 추출이 비어 있거나 부자연스러운 경우 사용자가 PDF 원본을 보며 원문 텍스트를 붙여 넣거나 다듬을 수 있다.
- OCR 자동 재추출은 이번 범위에서 제외했다. Docker/Tesseract 전환은 로컬 이미지 빌드와 `kor` 언어팩 확인까지 성공했지만, 자동 OCR 경로가 원문을 비우는 UX 리스크가 있어 커밋하지 않고 제거했다.

실행한 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_papers.py`: 67 passed.
- `npm run lint`: 통과.
- `npm run build`: 통과.
- `git diff --check`: 통과.

운영 확인 필요:

- 자료 01/02/03 유형 PDF를 다시 업로드해 추출 품질 경고가 표시되는지 확인한다.
- 추출 본문이 일부라도 있으면 원문 패널에 보존되는지 확인한다.
- 텍스트 직접 입력 후 자동 저장, 새로고침 복원, 하이라이트 offset 계산이 정상인지 확인한다.

### 2026-06-27 PDF 추출 잔여 개선안 적용

반영한 범위:

- OCR 자동화(기존 3번 개선안)는 제외하고, 텍스트 레이어가 있는 PDF에서 가능한 보정만 추가했다.
- `국 문 초 록`, `A B S T R A C T`처럼 glyph 단위 공백이 단어 공백으로 추출되는 줄을 PDF 추출 경로에서 복원한다.
- 일반 문장(`We propose a new model`)은 과보정하지 않도록, 줄 대부분이 한 글자 토큰일 때만 공백을 제거한다.
- 좌표 기반 reflow 결과가 비어 있거나 PyMuPDF 기본 추출보다 본문 보존량이 크게 적은 경우, 기본 추출 결과를 fallback으로 선택한다.
- 기본 추출 fallback에도 페이지 번호/noise 제거, glyph 공백 보정, 구두점 공백 정리를 적용한다.

실행한 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_papers.py`: 72 passed.

운영 확인 필요:

- 자료 01/02/03 유형 PDF에서 한글 제목/초록/섹션명이 글자 단위로 벌어지지 않는지 확인한다.
- 좌표 reflow가 본문 일부만 남기던 PDF에서 원문 패널에 기본 추출 텍스트가 보존되는지 확인한다.

### 2026-06-27 PDF 추출 품질 상태 표시

반영한 범위:

- 백엔드 PDF 추출 응답에 `extraction_quality`를 추가했다.
- 품질 객체는 `score(0-100)`, `status(good/review/poor/failed)`, `reasons`, `source(auto/user_edited)`로 구성한다.
- 기존 `metadataWarnings`/업로드 노티 문구는 유지하고, 노티 앞부분과 원문 패널 상태 박스에 `추출 품질: 확인 필요 (점수/100)` 형태로 보충 표시한다.
- 사용자가 원문 패널에서 텍스트를 직접 저장하면 `source: user_edited`로 바꾸어 자동 추출 품질과 사용자 보정 상태를 구분한다.
- `extractionQuality`는 SQLite/PostgreSQL `paper_metadata.extraction_quality`에 저장하며, 기존 DB는 앱 시작 시 컬럼을 추가한다.

실행한 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_papers.py backend/tests/test_db.py`: 86 passed.
- `npm run lint`: 통과.
- `npm run build`: 통과.
- `git diff --check`: 통과.

### 2026-06-28 섹션 헤더 정렬형 2단 레이아웃 개선

반영한 범위:

- `논문형식_04`처럼 상단은 제목/초록 1단이고 하단은 2단인 논문에서, `1. 서론` 같은 섹션 헤더가 오른쪽 컬럼 첫 줄과 같은 높이에 놓이는 형식을 우선 보정했다.
- 컬럼 시작 y좌표를 섹션 헤더 포함 시작점(`column_start_y`)과 안정적인 좌우 본문 pair 시작점(`body_pair_start_y`)으로 분리했다.
- `1. 서론`, `2.1 시스템 구조` 같은 번호 섹션 헤더는 상단 1단 영역으로 빼지 않고 해당 컬럼 내부 첫 줄로 유지한다.
- 2단 구간은 컬럼별로 먼저 분리한 뒤 각 컬럼 안에서 독립 reflow하고, 최종적으로 왼쪽 컬럼 전체 후 오른쪽 컬럼 전체 순서로 결합한다.

실행한 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_papers.py`: 76 passed.

운영 확인 필요:

- `논문형식_04`와 같은 PDF에서 `1. 서론` 뒤에 오른쪽 컬럼 문장이 바로 붙지 않는지 확인한다.
- 상단 초록/키워드가 먼저 나오고, 이후 왼쪽 컬럼 본문 전체가 오른쪽 컬럼보다 먼저 나오는지 확인한다.

### 2026-06-28 상단 초록 누락형 품질 검수 보강

반영한 범위:

- `논문형식_05`처럼 제목/요약/ABSTRACT/키워드가 상단 1단에 있고 하단 2단이 `Ⅰ. 서론`으로 시작하는 형식을 추가 보정했다.
- 컬럼 시작 신호에 로마숫자 섹션 헤더(`Ⅰ. 서론`, `I. Introduction` 등)를 추가했다.
- reflow 결과가 `요약`, `ABSTRACT`, `키워드` 같은 상단 front matter marker를 누락하고 raw 추출 결과에는 해당 marker가 있으면 raw 결과를 선택하도록 보수화했다.
- 품질 경고와 점수 계산에 front matter 누락 신호를 추가했다. 일부 서론 문장만 그럴듯하게 남아도 제목·초록·키워드 영역 누락이 감지되면 100점이 나오지 않아야 한다.

실행한 검증:

- `backend/.venv/bin/python -m pytest backend/tests/test_papers.py`: 78 passed.

운영 확인 필요:

- `논문형식_05` 유형 PDF에서 요약, ABSTRACT, 키워드가 원문 패널에 보존되는지 확인한다.
- 일부 서론 문장만 남는 경우 품질 점수가 100/100으로 표시되지 않고 누락 경고가 표시되는지 확인한다.

### 2026-06-28 리뷰 노트 UI/내보내기 정리

반영한 범위:

- 리뷰 노트 기능 라벨을 `하이라이트`, `용어 사전`, `노트 내려받기`로 정리했다.
- 리뷰 노트 패널 배치를 진행 로드맵, 논문 메타정보, 읽으며 생긴 질문, 수동 요약 템플릿, 하이라이트, 인용 후보 보드, 용어 사전, 노트 내려받기 순서로 조정했다.
- 내보내기 포함 항목에서 현재 UI에 없는 한 줄 요약, 섹션별 요약, 섹션별 메모를 제거했다.
- 노트 내려받기 카드에서 상단 진행률과 중복되는 로드맵 기준 완성도 막대를 제거했다.
- 문자 추출 실패 시 PDF 뷰어를 읽고 직접 정리할 수 있도록 수동 요약 템플릿을 목록형 입력으로 복원했다.
- 수동 요약 템플릿 항목은 하이라이트 의미 라벨을 사용하고, 인용 목적을 선택하면 인용 후보 보드에 함께 분류된다.

실행한 검증:

- `npm run lint`: 통과.
- `npm run build`: 통과.
- `npm test -- --run`: 30 passed.
- `git diff --check`: 통과.

### 2026-07-03 PDF 뷰어 실험 분리와 안전 변경 커밋

진행 판단:

- PDF 위 드래그 하이라이트 실험은 단 나눔 PDF에서 드래그 범위가 정확히 잡히지 않고, 선택 범위 밖 글자까지 노트에 들어가는 문제가 있어 커밋 범위에서 제외했다.
- 체감 개선이 작은 PDF 선택 알고리즘 변경은 보류하고, 서비스 상태 개선 여부를 보기 위해 리스크가 낮은 변경만 먼저 분리했다.

반영한 범위:

- 폼 입력 요소에 `aria-label`/`title`을 보강했다.
- 원문 하이라이트 이벤트가 입력 필드 안에서 잘못 발동하지 않도록 방어했다.
- 백엔드와 Vite dev/preview 응답에 `X-Content-Type-Options`, `Cache-Control`, JSON/정적 리소스 charset 보정을 추가했다.
- PDF 텍스트 레이어의 `text-size-adjust` 설정은 전역 `html` 기준으로 이동해 브라우저 텍스트 크기 보정 정책을 단순화했다.

보류한 범위:

- PDF 드래그 선택/팬 모드 실험과 관련된 `PdfViewer.tsx` 변경은 워킹트리에 남겨 두고 커밋하지 않았다.

실행한 검증:

- `npx eslint src/components/AuthControls.tsx src/components/QuestionsCard.tsx src/components/TagEditor.tsx src/components/workspace/PaperSidebar.tsx src/components/workspace/ReviewNotePanel.tsx src/components/workspace/SourcePanel.tsx src/components/workspace/UploadBar.tsx src/hooks/useReviewStore.tsx`: 통과.
- `npx eslint vite.config.ts`: 통과.
- `npm run build`: 통과.
- `backend/.venv/bin/python -m pytest backend/tests/test_diagnostics.py backend/tests/test_auth.py`: 15 passed.
- `git diff --cached --check`: 통과.

### 2026-07-03 배포 캐시와 chunk load 오류 처리

확인한 증상:

- 운영 백엔드 CORS preflight와 PUT 오류 응답은 `Access-Control-Allow-Origin: https://nebu-25.github.io`를 정상 반환했다.
- 브라우저 콘솔의 `assets/pdf-95_jJHHo.js 404`는 현재 Pages 배포에 없는 이전 PDF chunk 파일명이었다.
- 현재 배포된 index 번들은 새 PDF chunk를 참조하고 있어, 배포 직후 브라우저 또는 GitHub Pages 캐시에 남은 이전 번들이 실행되는 상황으로 판단했다.

반영한 범위:

- Vite/브라우저 동적 import 실패 메시지를 감지하는 `chunkLoad` 유틸을 추가했다.
- 전역 `unhandledrejection`에서 chunk load 실패를 감지하면 앱 ErrorBoundary가 새 배포 파일을 다시 받아야 한다는 복구 화면을 표시한다.
- PDF 뷰어 내부의 `pdf.js` 동적 import 실패도 일반 PDF 원본 오류 대신 새로고침 안내로 표시한다.
- chunk load 오류 판별 단위 테스트를 추가했다.

실행한 검증:

- `npm test -- chunkLoad.test.ts --run`: 3 passed.
- `npx eslint src/lib/chunkLoad.ts src/lib/chunkLoad.test.ts src/main.tsx src/components/AppErrorBoundary.tsx src/components/workspace/PdfViewer.tsx`: 통과.
- `npm run build`: 통과.

### 2026-07-03 백엔드 연결 오류 메시지 분리

반영한 범위:

- API 오류를 `auth`, `forbidden`, `not_found`, `server_starting`, `server_error`, `timeout`, `cors_or_network`, `bad_request` 등으로 분류하는 공통 유틸을 추가했다.
- 노트 저장/삭제/복원 실패 시 인증 만료, 서버 준비 중, 서버 처리 오류, CORS 또는 네트워크 실패를 서로 다른 제목과 메시지로 안내한다.
- PDF 업로드, 샘플 PDF, PDF URL 등록 흐름에서도 같은 분류 메시지를 사용한다.
- fetch 실패와 CORS 차단은 브라우저에서 둘 다 `TypeError: Failed to fetch`로 들어오므로, 사용자 안내에서는 `서버 요청 차단 또는 네트워크 실패`로 묶어 표시한다.

실행한 검증:

- `npm test -- apiErrors.test.ts --run`: 3 passed.
- `npx eslint src/lib/apiErrors.ts src/lib/apiErrors.test.ts src/hooks/useReviewPersistence.ts src/hooks/useReviewStore.tsx`: 통과.
- `npm test -- apiErrors.test.ts useReviewStore.test.ts --run`: 12 passed.
- `npm run build`: 통과.

### 2026-07-03 자동 저장 재시도 UX 개선

반영한 범위:

- 자동 저장 `flush()`가 이미 실행 중이면 중복 실행하지 않도록 막았다.
- 삭제 대기 건도 자동 재시도 조건에 포함했다.
- 저장 실패 후 다음 재시도 시각과 남은 초를 상태로 관리한다.
- 인증/권한 오류는 자동 재시도를 멈추고 재로그인/권한 확인 안내를 유지한다.
- 리뷰 노트 상단 저장 상태에 `저장 중`, `N초 후 재시도`, `지금 다시 저장` 버튼을 추가했다.
- 수동 재시도는 backoff 대기를 초기화하고 즉시 저장을 다시 시도한다.

실행한 검증:

- `npx eslint src/hooks/useReviewPersistence.ts src/hooks/useReviewStore.tsx src/components/workspace/ReviewNotePanel.tsx`: 통과.
- `npm test -- useReviewStore.test.ts --run`: 9 passed.
- `npm run build`: 통과.

### 2026-07-03 PDF 드래그 하이라이트 재설계

재설계 목표:

- PDF 위 드래그 하이라이트의 저장 범위는 사용자가 선택한 문장 시작과 끝 범위와 같아야 한다.
- 저장되는 하이라이트 텍스트도 사용자가 실제 선택한 텍스트와 같아야 한다.

반영한 범위:

- 좌표 박스에 겹친 글자를 추정하던 드래그 선택 실험을 제거했다.
- PDF 텍스트 레이어의 브라우저 `Selection`/`Range`를 기준으로 하이라이트 rect와 텍스트를 생성한다.
- 선택 모드와 이동 모드를 분리했다. 선택 모드에서는 네이티브 텍스트 선택을 그대로 사용하고, 이동 모드 또는 Alt/가운데 버튼 드래그에서는 화면 이동을 수행한다.
- 선택 확정 전 미리보기는 실제 `Range.getClientRects()` 기반 rect만 표시한다.

실행한 검증:

- `npx eslint src/components/workspace/PdfViewer.tsx`: 통과.
- `npm test -- useReviewStore.test.ts --run`: 9 passed.
- `npm run build`: 통과.

운영 확인 필요:

- 2단 PDF에서 왼쪽 컬럼 한 문장을 드래그했을 때 오른쪽 컬럼 문장이 하이라이트 텍스트에 섞이지 않는지 확인한다.
- 문장 중간에서 시작해 문장 중간에서 끝낸 경우 저장 텍스트가 선택 범위와 일치하는지 확인한다.

### 2026-07-03 PDF 하이라이트 끝 글자 보정

반영한 범위:

- PDF textLayer의 글자 폭/커서 위치 차이로 선택 끝 한 글자가 저장 텍스트에서 빠질 수 있는 문제를 보정했다.
- 선택이 정방향이고 마우스 포인터가 다음 글자의 중간 지점을 넘은 상태라면 `Range` 끝을 한 글자 확장한다.
- 확장된 `Range`에서 텍스트와 rect를 함께 다시 계산해 저장 텍스트와 표시 범위가 같은 기준을 쓰도록 했다.

실행한 검증:

- `npx eslint src/components/workspace/PdfViewer.tsx`: 통과.
- `npm test -- useReviewStore.test.ts --run`: 9 passed.
- `npm run build`: 통과.

### 2026-07-03 PDF 원본 인증 대기와 401 안내

반영한 범위:

- PDF 원본 보기는 `accessToken`이 없으면 `/api/papers/{id}/pdf` 요청을 보내지 않고 세션 확인 안내를 표시한다.
- PDF 원본 fetch는 항상 `Authorization: Bearer ...` 헤더를 포함하도록 단순화했다.
- 401 응답은 로그인 세션 새로고침 필요와 현재 계정에 PDF 원본이 연결되지 않았을 가능성을 함께 안내한다.

실행한 검증:

- `npx eslint src/components/workspace/PdfViewer.tsx`: 통과.
- `npm run build`: 통과.

### 2026-07-03 Preview 헤더와 CSS 빌드 타깃 정리

반영한 범위:

- Vite dev 서버의 `Cache-Control`을 `no-store`에서 재검증 정책으로 바꿔 로컬 진단 경고를 줄였다.
- Vite preview 서버에서 HTML/SPA 라우트와 해시가 붙은 정적 에셋의 캐시 정책을 분리했다.
- 해시가 붙은 `assets/*.{css,js,mjs}` 파일은 `public, max-age=31536000, immutable`로 응답한다.
- HTML 라우트는 `public, max-age=0, must-revalidate`로 응답해 새 배포 확인 시 문서를 재검증한다.
- CSS 빌드 타깃을 현대 Chrome 기준으로 지정해 산출물의 불필요한 벤더 프리픽스를 줄였다.

실행한 검증:

- `npx eslint vite.config.ts`: 통과.
- `npm run build`: 통과.
- `npm run preview -- --port 4173`: 실행 후 로컬 헤더 확인.
- `curl -I http://127.0.0.1:4173/Paperlens_26.06/service_home/`: `Content-Type: text/html; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `X-Content-Type-Options: nosniff` 확인.
- `curl -I http://127.0.0.1:4173/Paperlens_26.06/assets/index-D4V0LV3h.css`: `Content-Type: text/css; charset=utf-8`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` 확인.

남는 경고:

- GitHub Pages가 직접 제공하는 `Expires` 헤더나 `X-Content-Type-Options` 누락은 저장소의 Vite 설정만으로 제어하기 어렵다. 이 항목을 완전히 해결하려면 Cloudflare Pages/Netlify/Vercel 같은 헤더 설정 가능한 정적 호스팅 또는 프록시가 필요하다.
- Tailwind preflight가 생성하는 `-webkit-text-size-adjust`는 산출물에 남는다. 표준 `text-size-adjust`도 함께 들어가며, 이를 제거하려면 Tailwind preflight 비활성화 또는 CSS 후처리가 필요해 리셋 스타일 영향이 크다.

### 2026-07-06 리뷰 노트 패널 접기(넓게 읽기)

반영한 범위:

- xl 이상 화면에서 리뷰 노트 헤더의 접기 버튼으로 노트 패널을 접어 원문/PDF 뷰어를 넓게 볼 수 있다. 접힌 상태에서는 세로 레일 버튼으로 다시 펼친다.
- 접힘 상태(`noteCollapsed`)는 `useReviewStore`가 관리하며 모바일 탭 전환과 무관하다.
- 원문 본문 폭을 `78ch`로 제한해 가독성을 높였다.

실행한 검증:

- `npx tsc -b`: 통과.
- `npx eslint src/`: 경고 0.
- `npm test`: 116 passed.

### 2026-07-06 PDF 뷰어 텍스트 레이어 정렬 수정 (하이라이트/용어 추가 영역 불일치)

증상: PDF 원본 보기에서 드래그로 하이라이트/용어를 추가할 때 선택 영역이 실제 본문 글자와 어긋나고, 캡처된 텍스트가 시각 영역과 맞지 않으며 페이지번호·좌표성 조각 등 엉뚱한 텍스트가 섞였다.

원인:

- pdfjs 6.x 텍스트 레이어는 각 글자 스팬을 `font-size: calc(var(--text-scale-factor) * var(--font-height))`와 `transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(...)`로 배치하는데, `styles.css`에 이 스팬 규칙이 빠져 있어 스팬이 상속 폰트 크기로 렌더됐다(글자 폭·위치가 캔버스와 불일치, 세로 텍스트가 가로로 눕음).
- 스케일 변수 `--total-scale-factor`가 어디에도 설정되지 않아 `--text-scale-factor` 계산이 invalid가 되어 위 font-size가 깨졌다.

반영한 범위:

- `src/styles.css`의 `.pdf-text-layer` 규칙을 공식 pdfjs 텍스트 레이어 CSS 기준으로 보강했다(스팬 `font-size`·`transform`, `--min-font-size`/`--text-scale-factor`/`--min-font-size-inv` 변수).
- `src/components/workspace/PdfViewer.tsx`가 텍스트 레이어 컨테이너에 현재 배율을 `--total-scale-factor`로 인라인 설정한다(확대/축소 시 자동 갱신, `--scale-round-x/y`도 함께 지정).

실행한 검증:

- `npx tsc -b`: 통과.
- `npx eslint src/components/workspace/PdfViewer.tsx`: 통과.
- `npm test`: 116 passed.
- `npm run build`: 통과.
- 남는 확인: 시각/상호작용 회귀라 렌더 테스트로는 못 잡는다. 실제 브라우저에서 PDF 선택 정렬 확인 권장(미실시).
