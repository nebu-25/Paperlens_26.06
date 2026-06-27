# Next Work Prompt

아래 프롬프트를 다음 작업 세션의 시작 메시지로 사용한다.

```text
PaperLens 프로젝트의 다음 개선 작업을 진행해 주세요.

현재 상태:
- 프론트엔드는 GitHub Pages에 배포됩니다.
- 시작 URL은 https://nebu-25.github.io/Paperlens_26.06/ 입니다.
- 로그인/사용설명서 랜딩 페이지가 시작 화면이고, 로그인 후 서비스 워크스페이스는 /Paperlens_26.06/service_home/ 입니다.
- GitHub Pages 빌드는 service_home/index.html, 404.html, favicon.svg를 생성합니다.
- 백엔드는 Render의 https://paperlens-backend-53ki.onrender.com 입니다.
- Supabase Auth가 켜져 있고, 프론트는 Supabase access token을 Authorization: Bearer로 FastAPI에 보냅니다.
- 백엔드는 HS256 토큰을 SUPABASE_JWT_SECRET으로 검증하고, 다른 알고리즘이면 Supabase /auth/v1/user fallback으로 사용자 id를 확인합니다.
- Supabase /auth/v1/user fallback 결과는 token hash 기준으로 최대 5분, token exp 이내에서 캐시합니다.
- /api/diagnostics는 비밀값 없이 Auth/DB/AI 설정 상태를 반환합니다.
- Pages workflow는 VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 형식을 검증합니다.
- 샘플 PDF 버튼은 먼저 /api/health로 Render 백엔드를 깨운 뒤 sample-pdf를 호출하고, 진행 단계/취소/재시도를 표시합니다.
- 샘플 PDF는 `sample:paperlens` sourceKey로 중복 등록을 막고, 실제 샘플 파일명은 `2604.04977v1.pdf`로 맞춥니다.
- DOI 입력은 메타데이터 등록용이고, 원문/뷰어 연결은 PDF 업로드 또는 PDF 원문 URL 입력으로 처리합니다.
- PDF 원문 URL은 `/api/papers/extract-url`로 다운로드한 뒤 기존 PDF 추출 파이프라인과 동일하게 저장/분석합니다.
- /api/notes 저장/복원 실패는 401, 503, 네트워크 실패를 구분해 안내합니다.
- 로그인 후 저장된 논문이 있으면 추가 업로드 없이 마지막 활성 논문 또는 첫 논문을 바로 엽니다.
- PDF 원본 보기는 Bearer token으로 PDF를 fetch한 뒤 blob URL로 iframe에 표시합니다. 실패해도 하이라이트 가능한 원문은 유지합니다.
- 원문 패널의 PDF 연결 안내는 숨김/다시보기를 지원하고, 사용자가 해결하기 어려운 원문 텍스트 경고는 닫으면 세션 중 숨깁니다.
- 브라우저 웹 번역은 React가 관리하는 원문/하이라이트 DOM과 충돌할 수 있어, 하이라이트 가능한 원문 영역은 `notranslate`/`translate="no"`로 보호합니다.
- 웹 번역 DOM 충돌 방어용 DOM mutation guard와 화면 복구용 ErrorBoundary가 들어가 있습니다.
- 하이라이트 선택 offset 계산 실패 시 빈 화면으로 가지 않고 경고를 표시합니다.
- 로컬 캐시 복원 후 저장 재시도는 `dirtyIds` 기준으로만 수행해, 보기만 하는 상태에서 전체 노트 PUT 루프가 돌지 않도록 했습니다.
- 이전 작업 복원은 로컬 캐시를 먼저 표시하고 서버 health/notes 동기화는 백그라운드로 수행합니다.
- 일반 자동 저장에서는 큰 `paper.text`를 PUT payload에서 제외하고, PDF/본문 연결처럼 원문 저장이 필요한 경우에만 포함합니다.
- 저장 재시도는 실패 후 최대 5분까지 늘어나는 backoff를 사용합니다.
- SQLite/PostgreSQL 저장소는 내부적으로 `paper_metadata`, `paper_texts`, `review_notes`, `paper_files` 분리 테이블을 사용합니다.
- 기존 단일 `papers` 테이블은 앱 시작 시 분리 테이블로 복사하며 자동 삭제하지 않습니다.
- 원문 패널은 `원문`/`PDF` 탭으로 같은 위치에서 전환합니다. PDF 원본은 Bearer token fetch 후 blob URL iframe으로 표시합니다.
- 하이라이트 라벨은 `주장`, `방법론`, `결과`, `한계/비판`, `질문/후속 확인`, `근거`를 사용합니다.
- 기존 요약 템플릿 영역은 인용 후보 보드로 대체했습니다. 하이라이트 문장별 인용 목적(`전제 인용`, `방법 참고`, `결과 비교`, `반론`, `한계 언급`, `관련 연구`)을 선택하면 보드에 자동 분류됩니다.
- 전체 리뷰 노트 내보내기에는 포함 항목 체크박스가 있어 용어 사전, 질문, 하이라이트, 인용 후보 보드 등 파트를 Markdown/PDF에서 제외할 수 있습니다.
- PDF 추출 품질 경고를 추가했습니다. 추출량이 적거나, 헤더/푸터 일부만 잡힌 듯하거나, 숫자/기호 비율이 높거나, 깨진 문자가 많은 경우 경고를 표시하되 추출 텍스트는 비우지 않고 보존합니다.
- PDF 추출 응답과 저장 데이터에는 `extractionQuality`가 포함됩니다. 점수(0-100), 상태(`양호`/`확인 필요`/`낮음`/`추출 실패`), 근거, 출처(`auto`/`user_edited`)를 기존 업로드 노티와 원문 패널 상태 박스에 보충 표시합니다.
- PDF 레이아웃은 1단, 2단, 상단 1단+하단 2단 혼합형으로 판정합니다. 혼합형은 상단 제목/저자/초록/키워드 후 하단 2단 본문을 왼쪽→오른쪽 순서로 읽습니다.
- PDF 추출 경로는 `국 문 초 록`, `A B S T R A C T`처럼 글자 단위로 벌어진 줄을 보정합니다. 일반 문장은 과보정하지 않도록 줄 대부분이 한 글자 토큰일 때만 적용합니다.
- 좌표 기반 reflow가 비어 있거나 본문 보존량이 크게 부족하면 PyMuPDF 기본 추출 결과를 fallback으로 선택합니다.
- 원문 패널에는 `텍스트 편집`/`직접 입력` 기능이 있습니다. 자동 추출이 비어 있거나 부자연스러운 경우 사용자가 PDF 원본을 보며 원문 텍스트를 붙여 넣거나 다듬을 수 있습니다.

최근 확인된 배포/설정 주의점:
- VITE_API_BASE_URL은 반드시 https://paperlens-backend-53ki.onrender.com 이어야 합니다.
- VITE_SUPABASE_URL은 https://<project-ref>.supabase.co 형식입니다.
- VITE_SUPABASE_ANON_KEY는 sb_publishable_... 값입니다.
- Render에는 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET이 모두 필요합니다.
- /service_home 직접 접근은 /service_home/로 redirect된 뒤 200이어야 합니다.
- 브라우저 기본 번역으로 번역된 본문 위에서 직접 하이라이트하는 UX는 안정 지원 대상이 아닙니다. 안정적인 번역 지원은 별도 번역 보기 패널로 설계하는 것이 필요합니다.
- 로컬 dev에서 백엔드를 띄우지 않으면 Vite `/api` proxy가 502를 낼 수 있습니다. 이 경우 보기만 하는 로컬 캐시가 반복 PUT을 보내지 않는지 확인하세요.
- 운영 DB 스키마 분리 배포 전 PostgreSQL snapshot 또는 `pg_dump "$DATABASE_URL" > paperlens-backup.sql` 백업이 필요합니다.
- WSL에는 `psql`/`pg_dump` PostgreSQL 18.4 클라이언트가 설치되어 있습니다.
- 직전 세션에서 사용자가 다른 값을 복사해 `psql`이 로컬 socket으로 접속하려 했습니다. 다음 세션에서는 Render `paperlens-backend > Environment`의 실제 `DATABASE_URL` 또는 PostgreSQL 리소스의 External Database URL을 먼저 확인해야 합니다.
- Docker/Tesseract 전환은 로컬 Docker 이미지 빌드와 `kor` 언어팩 확인까지 성공했지만 커밋하지 않았습니다. 자동 OCR은 원문을 비우는 UX 리스크와 서버 비용/런타임 의존성 때문에 우선 제외했습니다.

우선순위 개선 작업:
1. PDF 추출 개선 운영 확인
   - 자료 01/02/03 유형 PDF를 다시 업로드해 추출 품질 경고가 표시되는지 확인
   - 업로드 노티와 원문 패널 상태 박스에 추출 품질 상태/점수/근거가 자연스럽게 표시되는지 확인
   - 추출 본문이 일부라도 있으면 원문 패널에 보존되는지 확인
   - 한글 제목/초록/섹션명이 글자 단위로 벌어지지 않는지 확인
   - 좌표 reflow가 본문 일부만 남기던 PDF에서 기본 추출 fallback이 원문을 보존하는지 확인
   - 상단 1단+하단 2단 혼합형 페이지에서 읽기 순서가 제목/초록/키워드 후 왼쪽 컬럼→오른쪽 컬럼인지 확인
   - 추출이 부자연스러운 PDF에서 `텍스트 편집`/`직접 입력` 후 자동 저장, 새로고침 복원, 하이라이트 offset 계산 확인
   - 원문 직접 저장 후 `사용자 보정됨` 상태가 저장되고 새로고침 뒤에도 유지되는지 확인
   - 필요하면 실제 PDF 샘플을 테스트 fixture로 추가하는 방안 검토

2. 배포 후 운영 수동 smoke test
   - GitHub Pages가 최신 JS 번들을 가리키는지 확인
   - Render가 최신 백엔드로 재배포됐는지 확인
   - /api/diagnostics 운영 응답에서 `auth.mode: supabase`, `auth.ready: true`, `auth.warnings: []` 확인
   - 실제 로그인 후 /api/notes 200 여부 확인
   - 로그인 후 저장된 논문이 추가 업로드 없이 바로 열리는지 확인
   - 샘플 PDF 버튼으로 PDF 다운로드, 텍스트 추출, 새 리뷰 노트 생성까지 확인
   - 샘플 PDF를 다시 눌렀을 때 기존 샘플 리뷰 노트를 여는지 확인
   - PDF 원본 보기에서 401 콘솔 오류 없이 blob 미리보기가 뜨거나 fallback 안내가 뜨는지 확인
   - DOI 등록은 메타데이터/원문 별도 연결 안내가 뜨는지 확인
   - PDF 원문 URL 예: https://arxiv.org/pdf/2604.04977v1 등록 시 원문 추출과 PDF 원본 보기가 연결되는지 확인
   - 일반 웹페이지 URL 입력 시 PDF 원문 URL이 필요하다는 안내가 뜨고 노트가 생성되지 않는지 확인
   - 로그아웃 후 /service_home 접근 시 랜딩으로 되돌아가는지 확인
   - 결과를 docs/testing.md의 운영 체크리스트에 반영

3. 랜딩 페이지 polish
   - 로그인된 사용자가 루트 랜딩에 들어왔을 때 "서비스로 이동" CTA를 더 명확하게 배치
   - 모바일에서 로그인 카드와 설명 카드 간격 확인
   - 헤더의 compact auth UI가 좁은 화면에서 사라지는 문제를 모바일 메뉴/아이콘으로 개선

4. 문서와 배포 자동화
   - docs/deployment.md의 환경변수 표를 실제 운영값 기준으로 재확인
   - Pages workflow는 프론트엔드/워크플로 변경시에만 자동 실행되도록 path 필터가 설정되어 있다
   - `backend/scripts/smoke_deployment.py`와 GitHub Actions `Production smoke` 워크플로로 공개 운영 endpoint 자동 확인을 수행한다
   - Render 배포 완료 시점은 GitHub Actions가 직접 알 수 없으므로 Render 배포 후 `Production smoke`를 수동 실행한다

5. 추가 저장/인증 견고화 검토
   - diagnostics endpoint 운영 응답을 배포 후 확인
   - fallback cache TTL이 운영 로그와 맞는지 관찰
   - 인증 서버 장애와 사용자 토큰 만료의 사용자 안내가 충분히 구분되는지 확인

6. 번역 보기 UX 설계
   - 원문 하이라이트 패널은 계속 `notranslate`로 보호
   - 별도 번역 보기 패널 또는 탭을 추가할지 검토
   - 번역 보기에서는 읽기/복사 중심으로 제공하고, 하이라이트는 원문 기준으로 저장하는 흐름 검토
   - 브라우저 번역 감지/안내 문구가 필요한지 검토

7. 스키마 분리 운영 검증
   - 배포 전 운영 PostgreSQL 백업 생성
   - 배포 후 분리 테이블 생성과 기존 `papers` 데이터 복사 여부 확인
   - 기존 저장 노트 조회, 원문 lazy load, PDF 원본 보기, 자동 저장 payload 축소가 정상 동작하는지 확인

검증 명령:
- cd frontend && npm run lint
- cd frontend && npm run build
- backend/.venv/bin/python -m pytest backend/tests/test_auth.py
- backend/.venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_diagnostics.py
- backend/.venv/bin/python -m pytest backend/tests/test_auth.py backend/tests/test_diagnostics.py backend/tests/test_papers.py
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg
- curl https://paperlens-backend-53ki.onrender.com/api/health
- curl https://paperlens-backend-53ki.onrender.com/api/diagnostics
- curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf

작업 방식:
- 기존 코드 스타일과 컴포넌트 구조를 유지하세요.
- 사용자 데이터 보존을 최우선으로 두고 destructive git 명령은 쓰지 마세요.
- 수정 후 관련 테스트/빌드를 실행하고, 실패하면 원인을 문서화하세요.
- 배포 설정 변경은 docs/deployment.md에 같이 반영하세요.
```
