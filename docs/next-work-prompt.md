# Next Work Prompt

아래 프롬프트를 다음 작업 세션의 시작 메시지로 사용한다.

```text
PaperLens 프로젝트의 다음 개선 작업을 진행해 주세요.

현재 상태:
- 프론트엔드는 GitHub Pages에 배포됩니다.
- 시작 URL은 https://nebu-25.github.io/Paperlens_26.06/ 입니다.
- 로그인/사용설명서 랜딩 페이지가 시작 화면이고, 로그인 후 서비스 워크스페이스는 /Paperlens_26.06/service_home/ 입니다.
- GitHub Pages 빌드는 service_home/index.html, 404.html, favicon.svg를 생성합니다.
- GitHub Pages 배포는 `actions/deploy-pages@v5`를 사용합니다. `actions/deploy-pages@v4`에서 빌드 후 Pages 배포 단계가 `Deployment failed, try again later.`로 실패하던 문제를 `v5` 갱신으로 해결했습니다.
- 백엔드는 Render의 https://paperlens-backend-53ki.onrender.com 입니다.
- 랜딩 페이지는 PaperLens.html 시안과 동일한 디자인(sticky nav, 제품 목업 히어로, 트러스트 스탯 스트립, 경쟁 분석 밴드, 3-pass·목적 템플릿·기능 카드)을 React로 이식했습니다. 요금 섹션은 과금 범위 밖이라 제외했습니다.
- 랜딩의 "무료로 리뷰 노트 만들기" 등 CTA는 로그인 모달을 엽니다. 모달은 데모 계정을 미리 채우고 이메일 입력에 focus하며 Esc/배경 클릭으로 닫힙니다. 로그인 상태면 CTA에서 바로 서비스로 이동합니다.
- GitHub Pages 빌드에 `VITE_DEMO_EMAIL`/`VITE_DEMO_PASSWORD`가 있으면 데모 계정이 로그인 폼에 미리 입력됩니다. 이 값은 공개 번들에 포함되므로 데모 전용 계정만 사용합니다.
- 데모 설문 링크는 https://forms.gle/WrYxvAt6RQqxVia29 입니다.
- 데모 설문 모달은 리뷰 노트 Markdown/PDF, 라이브러리 취합 Markdown, 연구 질문 문서 Markdown 내보내기 후 먼저 표시합니다.
- 내보내기 설문 모달을 보지 않은 사용자는 로그아웃 완료 후 설문 모달을 한 번 볼 수 있습니다. 로그아웃 자체는 막지 않습니다.
- 설문 참여 완료는 `localStorage`, 세션 내 숨김/이미 표시 상태는 `sessionStorage`로 저장해 같은 세션에서 반복 노출하지 않습니다.
- 랜딩 페이지는 로드 즉시 백그라운드에서 `/api/health`를 호출해 Render 무료 플랜 콜드스타트를 미리 깨웁니다. 요청 실패는 UI에 표시하지 않습니다.
- Supabase Auth가 켜져 있고, 프론트는 Supabase access token을 Authorization: Bearer로 FastAPI에 보냅니다.
- 백엔드는 HS256 토큰을 SUPABASE_JWT_SECRET으로 검증하고, 다른 알고리즘이면 Supabase /auth/v1/user fallback으로 사용자 id를 확인합니다.
- Supabase /auth/v1/user fallback 결과는 token hash 기준으로 최대 5분, token exp 이내에서 캐시합니다.
- /api/diagnostics는 비밀값 없이 Auth/DB/AI 설정 상태를 반환합니다.
- Pages workflow는 VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 형식을 검증합니다.
- Pages workflow는 `frontend/**` 또는 `.github/workflows/deploy-pages.yml` 변경 때 자동 실행되며, 문서만 변경한 push에서는 자동 Pages 배포를 건너뜁니다.
- 샘플 PDF 버튼은 먼저 /api/health로 Render 백엔드를 깨운 뒤 sample-pdf를 호출하고, 진행 단계/취소/재시도를 표시합니다.
- 샘플 PDF 흐름은 단계별 timeout을 둡니다. `/api/health` 10초, `/api/papers/sample-pdf` 30초, `/api/papers/extract-text` 90초이며, 사용자가 누른 취소와 서버 지연 실패를 구분해 안내합니다.
- 샘플 PDF는 `sample:paperlens` sourceKey로 중복 등록을 막고, 실제 샘플 파일명은 `2604.04977v1.pdf`로 맞춥니다.
- DOI 입력은 메타데이터 등록용이고, 원문/뷰어 연결은 PDF 업로드 또는 PDF 원문 URL 입력으로 처리합니다.
- PDF 원문 URL은 `/api/papers/extract-url`로 다운로드한 뒤 기존 PDF 추출 파이프라인과 동일하게 저장/분석합니다.
- /api/notes 저장/복원 실패는 401, 503, 네트워크 실패를 구분해 안내합니다.
- 데모 계정 로그인 직후 `/api/notes`에서 수행하는 데모 세션 seed는 저장소별 bulk SQL로 처리합니다. 기존 Python 루프(`get_note`/`upsert_note` 반복)보다 빠르게 동작하며, PDF 바이너리는 복사하지 않고 본문 텍스트는 lazy-load 복원을 위해 복사합니다.
- 데모 세션 만료 데이터 정리는 `/api/notes` 요청마다 실행하지 않고 프로세스 기준 10분 간격으로 제한해 로그인 초기 요청 지연을 줄였습니다.
- 로그인 후 초기 복원은 `/api/health`를 비차단 warm-up으로 호출하고 `/api/notes`는 최대 30초까지 기다립니다. Render 콜드스타트/데모 seed 지연 중에도 로컬 캐시 또는 안내 상태를 먼저 유지합니다.
- 로그인 후 문서 복원 중에는 빈 상태 화면 대신 skeleton 준비 화면을 표시합니다. 데모 계정은 "빠른 테스트 문서", 일반 계정은 "저장된 작업"을 확인 중이라고 구분해 안내하며, 사이드바도 복원 중 문구를 표시합니다.
- 로그인 후 저장된 논문이 있으면 추가 업로드 없이 마지막 활성 논문 또는 첫 논문을 바로 엽니다.
- PDF 원본 보기는 Bearer token으로 PDF를 fetch한 뒤 blob URL로 iframe에 표시합니다. 실패해도 하이라이트 가능한 원문은 유지합니다.
- 원문 패널의 PDF 연결 안내와 원문 텍스트 상태 경고는 기본 접힘 상태의 작은 상태 줄로 표시합니다. 상세 설명, PDF 연결 버튼, OCR 버튼은 사용자가 "상세 보기"를 눌렀을 때만 펼쳐 산만함을 줄입니다.
- 업로드/샘플 PDF의 성공·안내 알림은 자동으로 사라집니다. 오류·경고는 사용자가 확인할 수 있도록 유지합니다.
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
- 리뷰 노트 패널은 진행 로드맵, 논문 메타정보, 읽으며 생긴 질문, 수동 요약 템플릿, 하이라이트, 인용 후보 보드, 용어 사전, 노트 내려받기 순서입니다.
- 수동 요약 템플릿은 문자 추출 실패 시 PDF 뷰어를 읽고 직접 정리하는 목록형 입력입니다. 항목마다 하이라이트 의미 라벨과 인용 목적을 선택할 수 있고, 인용 목적이 있으면 인용 후보 보드에 함께 분류됩니다.
- 노트 내려받기에는 포함 항목 체크박스가 있어 수동 요약 템플릿, 용어 사전, 질문, 하이라이트, 인용 후보 보드 파트를 Markdown/PDF에서 제외할 수 있습니다.
- PDF 추출 품질 경고를 추가했습니다. 추출량이 적거나, 헤더/푸터 일부만 잡힌 듯하거나, 숫자/기호 비율이 높거나, 깨진 문자가 많은 경우 경고를 표시하되 추출 텍스트는 비우지 않고 보존합니다.
- PDF 추출 응답과 저장 데이터에는 `extractionQuality`가 포함됩니다. 점수(0-100), 상태(`양호`/`확인 필요`/`낮음`/`추출 실패`), 근거, 출처(`auto`/`user_edited`)를 기존 업로드 노티와 원문 패널 상태 박스에 보충 표시합니다.
- PDF 레이아웃은 1단, 2단, 상단 1단+하단 2단 혼합형으로 판정합니다. 혼합형은 상단 제목/저자/초록/키워드 후 하단 2단 본문을 왼쪽→오른쪽 순서로 읽습니다.
- `1. 서론` 같은 번호 섹션 헤더가 오른쪽 컬럼 첫 줄과 같은 높이에 놓이는 2단 논문 형식을 보정했습니다. 컬럼 시작 y좌표와 안정적인 좌우 본문 pair 시작 y좌표를 분리하고, 번호 섹션 헤더는 컬럼 내부 첫 줄로 유지합니다.
- `Ⅰ. 서론` 같은 로마숫자 섹션 헤더도 컬럼 시작 신호로 인식합니다. reflow 결과가 `요약`/`ABSTRACT`/`키워드` 같은 상단 front matter를 누락하고 raw 추출 결과에는 남아 있으면 raw 결과를 선택하며, 품질 점수에도 누락 경고를 반영합니다.
- PDF 추출 경로는 `국 문 초 록`, `A B S T R A C T`처럼 글자 단위로 벌어진 줄을 보정합니다. 일반 문장은 과보정하지 않도록 줄 대부분이 한 글자 토큰일 때만 적용합니다.
- 좌표 기반 reflow가 비어 있거나 본문 보존량이 크게 부족하면 PyMuPDF 기본 추출 결과를 fallback으로 선택합니다.
- 원문 패널에는 `텍스트 편집`/`직접 입력` 기능이 있습니다. 자동 추출이 비어 있거나 부자연스러운 경우 사용자가 PDF 원본을 보며 원문 텍스트를 붙여 넣거나 다듬을 수 있습니다.
- OCR 재추출은 `OCR_ENABLED=true`, `OCR_PROVIDER=auto`, `CLOVA_OCR_INVOKE_URL`, `CLOVA_OCR_SECRET_KEY`로 활성화합니다.
- OCR provider는 NAVER CLOVA OCR과 RapidOCR을 병행합니다. `auto` 모드는 영문 힌트가 있으면 RapidOCR을 우선하고, 그 외에는 CLOVA를 우선합니다. 첫 결과 품질이 낮으면 다른 provider로 fallback합니다.
- CLOVA OCR은 General 도메인 API Gateway Invoke URL을 사용합니다. CLOVA가 단일 언어 중심이라 한국어 문서 우선 provider로 두고, 기존 영어 OCR 대응은 RapidOCR fallback으로 보완합니다.
- CLOVA 표 인식은 별도 과금 때문에 비활성화했고 요청 payload에도 포함하지 않습니다.
- `/api/diagnostics`는 `ocr.provider`, `ocr.providers`, `ocr.ready`, `ocr.configured`, `ocr.warnings`를 반환합니다. 현재 운영 확인 기준은 `ocr.enabled: true`, `provider: auto`, `providers.clova: true`, `providers.rapidocr: true`, `ready: true`, `warnings: []`입니다.

최근 확인된 배포/설정 주의점:
- 2026-07-07에 로그인 후 서비스 화면 공백기와 파일 로드 후 알림 과다 문제를 1차 개선했습니다. `loaded=false` 상태에서는 skeleton 준비 화면을 보여 주고, 업로드 info/success 알림은 자동 숨김 처리하며, 원문 PDF/추출 품질 안내는 접힌 상태 줄로 축소했습니다.
- 2026-07-07에 데모 로그인 직후 빠른 테스트 문서 로드가 오래 걸리고 샘플 PDF가 이어서 실패하는 현상을 분석했습니다. 1차 개선으로 데모 seed bulk copy, 데모 cleanup rate limit, 초기 health 비차단화, `/notes` 30초 대기, 샘플 PDF 단계별 timeout을 적용했습니다. 배포 후 Network 탭에서 `/api/notes`, `/api/papers/sample-pdf`, `/api/papers/extract-text` 시간을 분리해 확인해야 합니다.
- 2026-07-06에 모달 크기/폰트 변경 이후 최신 배포가 반영되지 않던 원인은 코드 빌드 실패가 아니라 GitHub Pages deploy job 실패였습니다. `actions/deploy-pages@v5` 갱신 커밋 `e1b886e` 이후 Pages 배포가 성공했고, 설문 프롬프트 커밋 `c1393d5`도 Pages 배포 성공을 확인했습니다.
- VITE_API_BASE_URL은 반드시 https://paperlens-backend-53ki.onrender.com 이어야 합니다.
- VITE_SUPABASE_URL은 https://<project-ref>.supabase.co 형식입니다.
- VITE_SUPABASE_ANON_KEY는 sb_publishable_... 값입니다.
- Render에는 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET이 모두 필요합니다.
- Render OCR 환경변수는 `OCR_ENABLED=true`, `OCR_PROVIDER=auto`, `CLOVA_OCR_INVOKE_URL`, `CLOVA_OCR_SECRET_KEY`를 사용합니다. 영어 fallback까지 유지하려면 `requirements-ocr.txt` 설치가 포함되어야 합니다.
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
   - `논문형식_04`처럼 `1. 서론`이 오른쪽 컬럼 첫 줄과 같은 높이에 있는 PDF에서 왼쪽 컬럼 헤더/본문이 오른쪽 컬럼보다 먼저 이어지는지 확인
   - `논문형식_05`처럼 상단 요약/ABSTRACT/키워드 후 하단 `Ⅰ. 서론` 2단 본문이 시작되는 PDF에서 상단 영역 누락 없이 원문이 보존되고 품질 점수가 100점으로 오판되지 않는지 확인
   - 상단 1단+하단 2단 혼합형 페이지에서 읽기 순서가 제목/초록/키워드 후 왼쪽 컬럼→오른쪽 컬럼인지 확인
   - 추출이 부자연스러운 PDF에서 `텍스트 편집`/`직접 입력` 후 자동 저장, 새로고침 복원, 하이라이트 offset 계산 확인
   - 원문 직접 저장 후 `사용자 보정됨` 상태가 저장되고 새로고침 뒤에도 유지되는지 확인
   - 필요하면 실제 PDF 샘플을 테스트 fixture로 추가하는 방안 검토

2. 배포 후 운영 수동 smoke test
   - GitHub Pages가 최신 JS 번들을 가리키는지 확인
   - Pages deploy job이 `actions/deploy-pages@v5`로 성공하는지 확인
   - Render가 최신 백엔드로 재배포됐는지 확인
   - /api/diagnostics 운영 응답에서 `auth.mode: supabase`, `auth.ready: true`, `auth.warnings: []` 확인
   - 실제 로그인 후 /api/notes 200 여부 확인
   - 로그인 직후 문서 복원 중 빈 화면이 아니라 skeleton 준비 화면이 보이는지 확인
   - 데모 계정 로그인 직후 `/api/notes`가 30초 안에 끝나고 기본 빠른 테스트 문서가 열리는지 확인
   - 로그인 후 저장된 논문이 추가 업로드 없이 바로 열리는지 확인
   - 파일이 열린 직후 큰 알림이 여러 개 쌓이지 않고, 원문 PDF/원문 상태 안내가 접힌 상태 줄로 보이는지 확인
   - 샘플 PDF 버튼으로 PDF 다운로드, 텍스트 추출, 새 리뷰 노트 생성까지 확인하고 `/sample-pdf`와 `/extract-text` 시간을 따로 기록
   - 샘플 PDF를 다시 눌렀을 때 기존 샘플 리뷰 노트를 여는지 확인
   - PDF 원본 보기에서 401 콘솔 오류 없이 blob 미리보기가 뜨거나 fallback 안내가 뜨는지 확인
   - DOI 등록은 메타데이터/원문 별도 연결 안내가 뜨는지 확인
   - PDF 원문 URL 예: https://arxiv.org/pdf/2604.04977v1 등록 시 원문 추출과 PDF 원본 보기가 연결되는지 확인
   - 일반 웹페이지 URL 입력 시 PDF 원문 URL이 필요하다는 안내가 뜨고 노트가 생성되지 않는지 확인
   - 로그아웃 후 /service_home 접근 시 랜딩으로 되돌아가는지 확인
   - 리뷰 노트 Markdown/PDF 내보내기 후 데모 설문 모달이 뜨고 설문 링크가 새 탭으로 열리는지 확인
   - 라이브러리 취합/연구 질문 문서 내보내기 후 데모 설문 모달이 뜨는지 확인
   - 같은 세션에서 설문 모달이 반복 노출되지 않는지, `이 데모 세션에서는 다시 보지 않기`가 동작하는지 확인
   - 설문 참여 클릭 후 다음 세션에서도 설문 모달이 다시 뜨지 않는지 확인
   - 결과를 docs/testing.md의 운영 체크리스트에 반영

3. 랜딩 페이지 polish
   - 로그인된 사용자가 루트 랜딩에 들어왔을 때 "서비스로 이동" CTA를 더 명확하게 배치
   - 모바일에서 로그인 모달 폭·간격과 배경 스크롤 잠금 동작 확인
   - 좁은 화면에서 nav 섹션 링크(왜 만들었나/사용 방법/목적 템플릿)가 숨겨질 때 모바일 메뉴/아이콘으로 개선
   - 랜딩 진입 warm-up 호출이 Pages 운영 번들에서 Render `/api/health`로 나가는지 Network 탭에서 확인

4. 문서와 배포 자동화
   - docs/deployment.md의 환경변수 표를 실제 운영값 기준으로 재확인
   - Pages workflow는 프론트엔드/워크플로 변경시에만 자동 실행되도록 path 필터가 설정되어 있다
   - Pages deploy action은 `actions/deploy-pages@v5`를 유지한다
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
- cd frontend && npm test -- --run src/hooks/useReviewPersistence.test.ts src/hooks/useReviewStore.test.ts
- backend/.venv/bin/python -m pytest backend/tests/test_auth.py
- backend/.venv/bin/python -m pytest backend/tests/test_db.py backend/tests/test_auth.py -q
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
