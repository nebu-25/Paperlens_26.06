# Deployment

PaperLens는 프론트엔드를 GitHub Pages에, 백엔드를 Render에 분리 배포합니다.

## Frontend: GitHub Pages

- URL: https://nebu-25.github.io/Paperlens_26.06/
- Workflow: `.github/workflows/deploy-pages.yml`
- Trigger: `main` push
- Build target: `frontend`
- Vite base path: `/Paperlens_26.06/`

GitHub Pages 설정에서 Source는 **GitHub Actions**를 사용해야 합니다. Pages가 자동 생성하는 Jekyll 기반 "pages build and deployment" 워크플로가 README를 앱 대신 배포하지 않도록 주의합니다.

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

## Environment Variables

Backend:

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열. 비어 있으면 SQLite 사용 |
| `CORS_ORIGINS` | Pages 오리진 포함 |
| `AI_API_KEY` | OpenRouter API 키. 없으면 AI 보조 비활성 |
| `AI_MODEL` | 선택. 기본 `openai/gpt-5.2` |
| `AI_SITE_URL` | 선택. OpenRouter 앱 표시용 |
| `AI_APP_NAME` | 선택. OpenRouter 앱 표시용 |
| `CROSSREF_MAILTO` | 선택. CrossRef User-Agent contact |

Frontend build:

| 변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | Pages 배포 시 Render 백엔드 오리진 |

## PostgreSQL

운영 배포에서는 외부 PostgreSQL을 권장합니다. Render 환경변수 `DATABASE_URL`에 연결 문자열을 설정한 뒤 재배포합니다.

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

## Smoke Checks

배포 후 콜드스타트가 끝난 뒤 health와 저장 API를 확인합니다.

```bash
curl https://paperlens-backend-53ki.onrender.com/api/health

cd backend
API_BASE_URL=https://paperlens-backend-53ki.onrender.com python scripts/smoke_api.py
```

AI 설정 확인:

```bash
curl https://paperlens-backend-53ki.onrender.com/api/ai/status
```

Pages 확인:

```bash
curl -L -I https://nebu-25.github.io/Paperlens_26.06/
```

## Backup

PostgreSQL 백업은 사용하는 제공자(Neon, Supabase, Render 등)의 스냅샷·백업 기능을 우선 사용합니다. CLI로 직접 백업할 때는 연결 문자열이 터미널 기록에 남지 않도록 주의합니다.

```bash
pg_dump "$DATABASE_URL" > paperlens-backup.sql
```

복구 전에는 운영 DB와 대상 DB 연결 문자열을 반드시 재확인합니다.
