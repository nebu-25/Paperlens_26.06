# Deployment

PaperLens는 프론트엔드를 GitHub Pages에, 백엔드를 Render에 분리 배포합니다.

## Frontend: GitHub Pages

- URL: https://nebu-25.github.io/Paperlens_26.06/
- Service URL: https://nebu-25.github.io/Paperlens_26.06/service_home/
- Workflow: `.github/workflows/deploy-pages.yml`
- Trigger: `main` push 중 `frontend/**` 또는 `.github/workflows/deploy-pages.yml` 변경, 또는 수동 실행
- Build target: `frontend`
- Vite base path: `/Paperlens_26.06/`

GitHub Pages 설정에서 Source는 **GitHub Actions**를 사용해야 합니다. Pages가 자동 생성하는 Jekyll 기반 "pages build and deployment" 워크플로가 README를 앱 대신 배포하지 않도록 주의합니다.

라우팅:

- `/Paperlens_26.06/`: 사용설명서 + 로그인 랜딩 페이지
- `/Paperlens_26.06/service_home/`: 로그인 후 논문 리뷰 워크스페이스
- 빌드 스크립트가 `dist/service_home/index.html`을 생성하므로 service URL 직접 접근은 200으로 응답합니다.
- `dist/404.html`도 생성해 기타 SPA 경로 fallback을 유지합니다.
- `frontend/public/favicon.svg`를 배포하고 `index.html`에서 `%BASE_URL%favicon.svg`로 참조합니다.
- `npm run predev`/`npm run prebuild` 시 `pdfjs-dist/wasm` 파일을 `frontend/public/pdfjs-wasm/`으로 자동 복사합니다. JBIG2 이미지 디코딩에 필요한 wasm 파일이며, 생성물이므로 `.gitignore`에서 제외합니다.

다른 오리진의 백엔드를 가리킬 때는 저장소 변수 `VITE_API_BASE_URL`을 설정합니다. 값에는 `/api`를 붙이지 않습니다. 프론트 코드가 자동으로 `/api`를 붙입니다.

예:

```text
VITE_API_BASE_URL=https://paperlens-backend-53ki.onrender.com
```

## Backend: Render

- Blueprint: `render.yaml`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`

무료 플랜은 미사용 시 잠들 수 있습니다. 첫 요청은 30~50초 정도 콜드스타트가 걸릴 수 있습니다.

콜드스타트 대응 원칙:

- 현재 프론트엔드는 샘플 PDF 흐름에서 `/api/health`를 먼저 호출해 백엔드를 깨우고, 진행 상태를 `백엔드 확인 중`으로 표시합니다.
- 노트 복원은 localStorage 캐시를 먼저 보여 주고, `/api/health`와 `/api/notes` 동기화는 백그라운드로 수행합니다. 백엔드가 늦으면 작업 화면을 막지 않고 `서버 준비 중` 또는 `로컬 저장 중` 안내를 표시합니다.
- 운영 smoke에서는 첫 `/api/health`가 30초 이상 걸릴 수 있음을 정상 범위로 보고, 이후 `/api/diagnostics`, `/api/ai/status`, sample PDF HEAD까지 이어서 확인합니다.

운영 대응 선택지:

| 선택지 | 장점 | 단점/주의 |
| --- | --- | --- |
| 현재 무료 플랜 유지 + UX 안내 | 비용 없음, 현재 구현과 잘 맞음 | 첫 방문·오랜 유휴 후 응답 지연이 계속 발생 |
| Render 유료 인스턴스 전환 | 콜드스타트 제거 또는 크게 감소 | 고정 비용 발생 |
| 외부 모니터로 주기적 health ping | 저비용으로 sleep 빈도 완화 가능 | 무료 플랜 정책·제공자 약관 확인 필요, 완전한 보장은 아님 |
| 백엔드 제공자 이전 | 성능·비용 조건 재검토 가능 | DB/env/CORS/배포 자동화 재검증 필요 |

현재 제품 단계에서는 **무료 플랜 유지 + 명확한 UX 안내 + 수동/자동 smoke**를 기본으로 두고, 실제 사용자 테스트에서 첫 요청 지연이 사용을 방해하면 유료 인스턴스 전환을 우선 검토합니다.

### 최근 백엔드 변경 재배포 노트

아래 변경은 코드 배포만으로 반영됩니다. **새 환경변수·DB 마이그레이션·재빌드 옵션이 필요 없으므로**, `main` 반영 후 Render를 평소처럼 재배포(자동 또는 Manual Deploy)하면 됩니다.

- **PDF 원문 URL SSRF 방어** (`/api/papers/extract-url`): 등록 URL이 공용 인터넷 주소인지 검증하고, 사설/내부망 대역(예: `127.0.0.1`, `10.0.0.0/8`, `169.254.0.0/16`, 링크로컬)이나 `http(s)`가 아닌 스킴, 사용자 인증정보 포함 URL을 400으로 거부합니다. 리다이렉트도 목적지마다 재검증합니다. 운영 영향: 내부망 PDF를 URL로 등록하려던 요청은 이제 명확한 400 안내와 함께 차단되며, 사용자는 "PDF 업로드"로 등록하도록 유도됩니다. 정상적인 공용 PDF URL 등록 동작은 그대로입니다.
- **캡션 ↔ 이미지 자동 매칭** (`figure_images`): 추출 응답의 각 그림 항목에 같은 페이지 캡션과 이어졌을 때 `captionId`/`captionLabel`(camelCase)이 추가됩니다. `paper_texts.figure_images` JSON 컬럼에 자유 형식으로 저장되므로 **스키마 변경이 없고**, 기존 노트도 다음 저장 시 자연히 필드가 채워집니다.

두 변경 모두 공개 계약(응답 형태)을 축소하지 않으므로 프론트 배포와 순서에 의존하지 않습니다. 재배포 후 `smoke_deployment.py`로 공개 endpoint를 확인합니다(아래 Smoke Checks).

## Environment Variables

Backend:

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 비어 있으면 SQLite 사용 |
| `CORS_ORIGINS` | Pages 오리진 포함 |
| `AI_API_KEY` | OpenRouter API 키. 없으면 AI 보조 비활성 |
| `AI_MODEL` | 선택. 기본 `openai/gpt-4o-mini` |
| `AI_SITE_URL` | 선택. OpenRouter 앱 표시용 |
| `AI_APP_NAME` | 선택. OpenRouter 앱 표시용 |
| `AI_RATE_LIMIT_PER_MINUTE` | 선택. AI 엔드포인트 사용자별 분당 호출 상한(기본 10, 0이면 무제한) |
| `REDIS_URL` | 운영 필수. AI rate limit 상태 공유용 Redis URL |
| `AI_DAILY_COST_LIMIT_CENTS` / `AI_MONTHLY_COST_LIMIT_CENTS` | 운영 권장. DB 비용 원장 기반 일/월 AI 추정 비용 한도 |
| `AI_PROMPT_COST_PER_MILLION_CENTS` / `AI_COMPLETION_COST_PER_MILLION_CENTS` | 운영 권장. 모델별 1M token당 prompt/completion 가격(USD cents) |
| `AI_PROVIDER_SPEND_LIMIT_CONFIGURED` | 운영 필수 marker. OpenRouter 등 provider 콘솔의 spend limit 설정 완료 시 `true` |
| `AI_PROVIDER_BILLING_ALERTS_CONFIGURED` | 운영 필수 marker. provider 결제 알림 설정 완료 시 `true` |
| `AI_KEY_ROTATION_RUNBOOK_URL` | 운영 필수 marker. AI API key 회전/폐기 절차 문서 URL |
| `CROSSREF_MAILTO` | 선택. CrossRef User-Agent contact |
| `SAMPLE_PDF_URL` | 선택. 배포 서버에 샘플 PDF 파일을 두지 않고 샘플 버튼을 사용할 때의 원격 PDF URL |
| `OCR_ENABLED` | 선택. 손상/스캔 PDF의 OCR 재추출 활성화(기본 false). 켜려면 requirements-ocr.txt 설치 필요 |
| `OCR_MAX_PAGES` | 선택. OCR 시도 페이지 상한(기본 20) |
| `OCR_DPI` | 선택. OCR 렌더 DPI(기본 200) |
| `OCR_REC_MODEL_PATH` / `OCR_REC_KEYS_PATH` | 선택. 한국어 rec ONNX 모델·dict 로컬 경로. 비우면 최초 사용 시 캐시로 다운로드 |
| `OCR_MODEL_DIR` | 선택. 모델 캐시 디렉터리(기본 `backend/.ocr_models`) |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key. 현재 운영은 `sb_publishable_...` 형식 |
| `SUPABASE_JWT_SECRET` | FastAPI가 HS256 access token을 직접 검증할 때 쓰는 JWT secret |
| `SUPABASE_JWT_AUD` | 선택. HS256 토큰 검증 시 요구할 audience(aud). 기본 `authenticated`. 빈 값으로 두면 aud 검사 비활성(비권장) |

Frontend build:

| 변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | Pages 배포 시 Render 백엔드 오리진 |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key. 현재 Supabase 콘솔의 `sb_publishable_...` 값을 사용 |

현재 배포 값 예:

```text
VITE_API_BASE_URL=https://paperlens-backend-53ki.onrender.com
VITE_SUPABASE_URL=https://<supabase-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

GitHub Pages 빌드에서는 이 값들을 GitHub에 넣습니다. Render의 환경변수와는 별개입니다.

권장 위치:

```text
Settings > Environments > github-pages > Environment variables
```

현재 Pages 워크플로의 `build` job은 `environment: github-pages`를 선언하므로 위 environment variables를 `vars.*`로 읽습니다. 저장소 전체 변수로 관리하려면 `Settings > Secrets and variables > Actions > Variables`에 같은 이름으로 넣어도 됩니다. Pages 워크플로는 프론트엔드 또는 워크플로 파일 변경이 있을 때만 자동 실행되며, 문서만 바뀐 push에서는 불필요한 Pages 빌드를 건너뜁니다.

배포된 화면에 `로그인 설정 전입니다`가 보이면 `VITE_SUPABASE_URL` 또는 `VITE_SUPABASE_ANON_KEY`가 빌드에 들어가지 않은 상태입니다. 샘플 PDF까지 실패하면 `VITE_API_BASE_URL`도 비어 있거나 잘못 들어갔을 가능성이 큽니다. 예를 들어 콘솔에 `.../sb_publishable_.../api/papers/sample-pdf 404`가 보이면 `VITE_API_BASE_URL` 자리에 Supabase anon/publishable key를 넣은 상태입니다. 현재 워크플로는 세 값 중 하나라도 비어 있거나 URL 형식이 맞지 않으면 배포 빌드를 실패시켜 잘못된 Pages 배포를 막습니다.

## Supabase Auth

Supabase Dashboard의 Authentication URL 설정에 아래 주소를 등록합니다.

Site URL:

```text
https://nebu-25.github.io/Paperlens_26.06/
```

Redirect URLs:

```text
https://nebu-25.github.io/Paperlens_26.06/**
http://127.0.0.1:5173/**
http://localhost:5173/**
```

Google OAuth를 사용할 때 Google Cloud Console의 OAuth Client에는 Supabase callback URL을 redirect URI로 등록합니다.

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

FastAPI는 Supabase access token을 다음 순서로 처리합니다.

1. `SUPABASE_JWT_SECRET`으로 HS256 JWT를 직접 검증합니다. 서명·`exp`·`sub`에 더해 `aud`(기본 `authenticated`, `SUPABASE_JWT_AUD`로 변경)와 `iss`(`SUPABASE_URL`이 설정된 경우 `{SUPABASE_URL}/auth/v1`)를 확인해, 다른 프로젝트·대상으로 발급된 토큰을 거부합니다.
2. 지원하지 않는 서명 알고리즘이면 `SUPABASE_URL`의 `/auth/v1/user`에 access token과 `SUPABASE_ANON_KEY`를 보내 사용자 id를 확인합니다.

Fallback 사용자 조회 결과는 token hash 기준으로 최대 5분 동안, token의 `exp`를 넘지 않는 범위에서 캐시합니다. 같은 로그인 세션의 자동 저장 요청이 반복되어도 Supabase Auth endpoint를 매번 호출하지 않기 위함입니다.

따라서 Render에는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`을 모두 설정해 둡니다.

AI 보조 엔드포인트(`POST /api/ai/term-explanation`)도 인증이 켜져 있으면 로그인 토큰을 요구하며, 검증된 `user_id` 기준으로 분당 호출을 제한합니다(`AI_RATE_LIMIT_PER_MINUTE`). 인증이 꺼져 있으면 단일 사용자 `local` 기준으로 합산됩니다.

## AI Cost Guardrails

AI 보조 기능은 짧은 용어 설명 전용이지만, 운영에서는 앱 내부 제한과 provider-side 제한을 같이 둡니다.

앱 내부 보호:

- `REDIS_URL`이 설정되면 AI rate limit가 Redis에 저장되어 다중 워커·다중 인스턴스에서 공유됩니다.
- 성공한 AI 호출은 DB `ai_usage_events` 원장에 사용자, 기능, 모델, token usage, 추정 비용으로 기록됩니다.
- `AI_DAILY_COST_LIMIT_CENTS`, `AI_MONTHLY_COST_LIMIT_CENTS`가 설정되면 호출 전에 누적 추정 비용을 확인하고 초과 시 429로 차단합니다.
- token 단가는 provider/model 변경 시 바뀌므로 `AI_PROMPT_COST_PER_MILLION_CENTS`, `AI_COMPLETION_COST_PER_MILLION_CENTS`로 운영 환경에서 주입합니다.
- 비용 원장 조회 실패, 사용량 기록 실패, 비용 guardrail이 켜진 상태에서 provider token usage가 누락된 경우에는 AI 결과를 반환하지 않고 503으로 차단합니다. 비용 보호 상태가 불확실하면 fail-closed가 기본입니다.

Provider-side 운영 체크:

- OpenRouter 등 provider 콘솔에서 API key 또는 account 단위 spend limit를 설정합니다.
- 결제 알림을 최소 1개 이상 설정합니다.
- API key 유출·퇴사·권한 변경 시 키를 폐기하고 재발급하는 회전 절차 문서를 유지합니다.
- 위 세 항목을 완료한 뒤 `AI_PROVIDER_SPEND_LIMIT_CONFIGURED=true`, `AI_PROVIDER_BILLING_ALERTS_CONFIGURED=true`, `AI_KEY_ROTATION_RUNBOOK_URL=<runbook-url>`을 Render에 설정합니다.

`/api/diagnostics`는 비밀값을 반환하지 않고 위 guardrail 설정 여부와 warning만 반환합니다. AI가 켜져 있는데 guardrail이 비어 있으면 `ai.ready=false`와 warning이 표시됩니다.

## PostgreSQL

운영 배포에서는 외부 PostgreSQL을 권장합니다. Render 환경변수 `DATABASE_URL`에 연결 문자열을 설정한 뒤 재배포합니다.

현재 저장소 구현은 기존 단일 `papers` 테이블을 유지하면서 아래 분리 테이블을 생성합니다.

- `paper_metadata`
- `paper_texts`
- `review_notes`
- `paper_files`

백엔드 시작 시 기존 `papers` 데이터가 있으면 새 분리 테이블로 `INSERT ... ON CONFLICT DO NOTHING` 방식으로 복사합니다. 기존 `papers` 테이블은 자동 삭제하지 않습니다. 운영 DB에 적용하기 전에는 제공자 snapshot 또는 `pg_dump` 백업을 먼저 만듭니다.

로컬에서 PostgreSQL 경로를 확인하려면 루트에서 컨테이너를 띄웁니다.

```bash
docker compose -f docker-compose.postgres.yml up -d
```

WSL에서 Linux Docker CLI가 Docker Desktop 소켓 권한 문제를 내면 Windows Docker CLI를 사용할 수 있습니다.

```bash
docker.exe compose -f docker-compose.postgres.yml up -d
```

검증:

```bash
cd backend
DATABASE_URL=postgresql://paperlens:paperlens_dev@127.0.0.1:5432/paperlens python scripts/smoke_postgres.py
```

## OCR (optional)

폰트/인코딩이 손상되거나 스캔(이미지) PDF라 텍스트 레이어가 깨진 경우, 저장된 PDF를 렌더→OCR로 재인식해 원문을 복구할 수 있습니다. 무겁고 느려서 기본 비활성(opt-in)입니다.

- 활성화: `OCR_ENABLED=true` + OCR 의존성 설치.
- 엔진: RapidOCR(ONNX). 한국어 rec 모델은 최초 호출 시 캐시로 1회 다운로드(~23MB)합니다. 런타임 다운로드를 피하려면 모델을 미리 두고 `OCR_REC_MODEL_PATH`/`OCR_REC_KEYS_PATH`를 지정하세요.
- 프론트: 추출 품질이 낮고 PDF가 연결된 경우 원문 패널에 "OCR로 다시 시도" 버튼이 뜹니다.

의존성 설치 주의 — libGL:
`rapidocr-onnxruntime`는 `opencv-python`을 끌어오는데, Render처럼 시스템 libGL이 없는 환경에서는 `libGL.so.1` ImportError가 납니다. 설치 후 `opencv-python`을 제거하고 `opencv-python-headless`만 남깁니다.

Render buildCommand(OCR 활성화 배포에서만):

```bash
pip install -r requirements.txt && pip install -r requirements-ocr.txt && pip uninstall -y opencv-python
```

메모리 주의:
Render 무료(512MB)에서는 onnxruntime + 페이지 이미지 버퍼가 빠듯해 OCR 실행 중 OOM이 날 수 있습니다. 안정 운영은 유료 인스턴스를 권장하며, 문제가 있으면 `OCR_ENABLED=false`로 즉시 되돌릴 수 있습니다(기본 배포·앱 동작에는 영향 없음).

모델 라이선스: 한국어 모델(`cycloneboy/korean_PP-OCRv4_rec_infer`)은 PaddleOCR(Apache-2.0) 계열입니다. 저장소에 번들하려면 라이선스를 먼저 확인하세요.

## Smoke Checks

배포 후 콜드스타트가 끝난 뒤 공개 endpoint를 확인합니다.

```bash
python3 backend/scripts/smoke_deployment.py
```

기본값은 운영 Pages와 Render URL입니다. 다른 환경을 확인할 때는 아래처럼 덮어씁니다.

```bash
FRONTEND_BASE_URL=https://nebu-25.github.io/Paperlens_26.06 \
API_BASE_URL=https://paperlens-backend-53ki.onrender.com \
python3 backend/scripts/smoke_deployment.py
```

GitHub Actions의 `Production smoke` 워크플로도 같은 검사를 수행합니다. 이 워크플로는 수동 실행할 수 있고, GitHub Pages 배포 워크플로가 성공한 뒤 자동으로도 실행됩니다. Render 배포는 GitHub Actions가 완료 시점을 직접 알 수 없으므로 Render 배포 후 필요할 때 수동 실행합니다.

`/api/diagnostics`는 비밀값을 반환하지 않고 Supabase/Auth/DB/AI 설정 여부만 반환합니다. 운영에서는 `auth.mode`가 `supabase`, `auth.ready`가 `true`, `auth.warnings`가 빈 배열이어야 합니다. AI를 켠 운영 환경에서는 `ai.ready`도 `true`, `ai.warnings`도 빈 배열이어야 합니다. `smoke_deployment.py`는 다음 공개 항목을 확인합니다.

- Pages 루트, `/service_home/`, `favicon.svg`
- Render `/api/health`, `/api/diagnostics`(`auth`/`ai`/`ocr` 상태 포함), `/api/ai/status`
- 미인증 `/api/notes` 401 응답
- `/api/papers/sample-pdf` HEAD 응답

```bash
curl https://paperlens-backend-53ki.onrender.com/api/health
curl https://paperlens-backend-53ki.onrender.com/api/diagnostics
curl https://paperlens-backend-53ki.onrender.com/api/ai/status
curl -L -I https://nebu-25.github.io/Paperlens_26.06/
curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/
curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg
curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf
```

PDF 원문 URL 등록은 로그인된 프론트에서 `/api/papers/extract-url` POST 요청으로 처리합니다. 이 endpoint는 보호 API이므로 curl smoke에서는 직접 확인하지 않고, 운영 브라우저에서 PDF 원문 URL 등록 흐름으로 확인합니다. 이 endpoint는 공용 인터넷 주소만 허용하는 SSRF 방어가 적용되어 있으므로, 사설/내부망 URL은 400으로 거부되는 것이 정상입니다(위 "최근 백엔드 변경 재배포 노트" 참고).

## Backup

PostgreSQL 백업은 사용하는 제공자(Neon, Supabase, Render 등)의 스냅샷·백업 기능을 우선 사용합니다. CLI로 직접 백업할 때는 연결 문자열이 터미널 기록에 남지 않도록 주의합니다.

```bash
pg_dump "$DATABASE_URL" > paperlens-backup.sql
```

WSL에는 PostgreSQL 클라이언트만 있으면 됩니다. 서버 설치는 필요 없습니다.

```bash
psql --version
pg_dump --version
```

복구 전에는 운영 DB와 대상 DB 연결 문자열을 반드시 재확인합니다.

## Local Cache Policy

PaperLens는 서버 저장을 기본 저장소로 사용하고, 로컬 캐시는 네트워크 지연·Render 콜드스타트·일시적 인증 장애 중 작업 유실을 줄이기 위한 임시 폴백으로 사용합니다.

로컬 캐시는 **IndexedDB 계정별 캐시**(`frontend/src/lib/localReviewCache.ts`)로 저장합니다.

- DB `paperlens-local-cache` — 스토어 `snapshots`(계정 키별 스냅샷: 라이브러리 메타데이터·리뷰 노트·마지막 활성 논문 id·서버 미반영 대기 id), `paperTexts`(원문 텍스트 분리 보관).
- 스냅샷은 **로그인 계정 키로 분리**되어, 같은 브라우저에서 계정을 바꿔도 다른 계정 캐시가 섞이지 않습니다.
- IndexedDB를 쓸 수 없는 환경에서는 `paperlens:cache:v2:` 접두어의 localStorage 폴백을 사용합니다.

운영 정책:

- 로그인된 사용자는 서버 동기화가 완료된 상태를 정본으로 봅니다. 화면에 `저장됨`이 표시되면 서버 반영이 완료된 상태입니다. `지금 저장`으로 수동 저장할 수 있고, 미저장 변경이 있으면 로그아웃 전에 저장 확인을 거칩니다.
- `로컬 캐시 표시`, `로컬 저장 중`, `서버 준비 중`, `인증 확인 필요`가 표시되는 동안의 변경 사항은 같은 브라우저에 임시 보관됩니다.
- 같은 계정을 다른 브라우저나 기기에서 사용할 때는 서버에 동기화된 데이터만 자동 공유됩니다. 아직 로컬 캐시에만 있는 변경은 다른 환경에 보이지 않습니다.
- 공용 PC나 공유 브라우저에서는 사용 후 로그아웃하고 브라우저 저장 데이터를 삭제하는 것을 권장합니다. IndexedDB·localStorage는 브라우저 프로필에 남을 수 있습니다.
- 로컬 캐시가 손상되거나 사용자가 브라우저 데이터를 삭제하면 서버에 이미 동기화된 데이터는 복원되지만, 로컬에만 있던 미동기 변경은 복구할 수 없습니다.

개선 후보:

- `로컬 임시 데이터 삭제` 버튼을 계정/설정 영역에 추가합니다.
- 캐시 스냅샷에 작성 시각과 앱 버전을 저장해 오래된 캐시 안내 또는 자동 만료 정책을 적용합니다.
- 서버 데이터와 로컬 미동기 데이터가 동시에 있을 때 충돌 비교 UI를 제공합니다.
