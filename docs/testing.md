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
- DOI 또는 URL 등록이 성공하거나, 조회 실패 시 수동 등록 fallback 안내가 표시된다.
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
