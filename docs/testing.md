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
- `frontend/src/lib/reviewProgress.test.ts`: 리뷰 진행률 체크리스트

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

- `backend/tests/test_papers.py`: DOI 정규화, CrossRef/arXiv 파싱, 섹션 감지, PDF reflow, 깨진 텍스트 감지, OCR fallback, 한국 논문 저자/소속 휴리스틱
- `backend/tests/test_ai.py`: AI 미설정 응답, 용어 설명 endpoint 503, OpenRouter 응답 파싱
- `backend/tests/test_db.py`: 저장소 facade와 노트 CRUD

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
curl -L -I https://nebu-25.github.io/Paperlens_26.06/
curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home
curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/
curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg
curl https://paperlens-backend-53ki.onrender.com/api/health
curl https://paperlens-backend-53ki.onrender.com/api/diagnostics
curl https://paperlens-backend-53ki.onrender.com/api/ai/status
curl -i https://paperlens-backend-53ki.onrender.com/api/notes
curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf

cd backend
API_BASE_URL=https://paperlens-backend-53ki.onrender.com python scripts/smoke_api.py
```

Render 무료 플랜은 콜드스타트가 있을 수 있으므로 첫 health 요청은 느릴 수 있습니다.

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

로그인 세션 필요:

- 로그인 후 `/api/notes`가 200을 반환하고 `{ library, notes }` 형태로 복원된다.
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
