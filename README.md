# PaperLens

PaperLens는 논문을 직접 읽으며 하이라이트, 용어, 질문, 요약을 하나의 구조화된 리뷰 노트로 정리하는 웹 워크스페이스입니다.

## Overview

- 원문/PDF 뷰어와 리뷰 노트를 한 화면에서 사용합니다.
- 드래그한 문장을 의미 라벨(핵심·방법·결과·한계·질문)로 하이라이트합니다.
- 모르는 용어를 사전에 추가하고, 설정된 경우 AI 설명 초안을 받을 수 있습니다.
- 5단계 리뷰 로드맵과 요약 템플릿으로 작성 진행률을 확인합니다.
- Supabase Auth 로그인 후 개인 라이브러리에 노트와 PDF 원본을 저장합니다.
- 서버 미연결 시 localStorage로 임시 폴백합니다.

## Live Demo

- Frontend: https://nebu-25.github.io/Paperlens_26.06/
- Service workspace: https://nebu-25.github.io/Paperlens_26.06/service_home/
- Backend health: https://paperlens-backend-53ki.onrender.com/api/health

## Features

| 기능 | 현재 상태 |
| --- | --- |
| 논문 등록 | PDF 업로드, DOI/URL 등록, 기존 노트에 PDF 본문 연결 |
| 업로드 UX | 업로드/텍스트 추출/메타정보 확인/노트 생성 진행률 표시 |
| 원문 보기 | 추출 텍스트 하이라이트, 2단 컬럼 PDF reflow, 저장된 PDF 원본 iframe 보기 |
| 하이라이트 | 문자 오프셋 기반 저장, 의미 라벨, 원문/목록 필터 |
| 용어 사전 | 드래그한 용어 추가, 직접 설명 작성, 선택형 AI 설명 |
| 리뷰 작성 | 5문항 요약 템플릿, 질문 기록, 5단계 진행률 |
| 로그인/저장 | Supabase Auth, 사용자별 노트 저장, localStorage 오프라인 폴백 |
| 내보내기 | 하이라이트 의미 라벨별 Markdown 다운로드, 브라우저 인쇄 기반 PDF 저장 |

## Current Deployment Notes

- 시작 URL(`/Paperlens_26.06/`)은 사용설명서와 로그인 랜딩 페이지입니다.
- 로그인 성공 후 `/Paperlens_26.06/service_home/`의 리뷰 워크스페이스로 진입합니다.
- GitHub Pages는 `service_home/index.html`, `404.html`, `favicon.svg`를 함께 배포해 직접 경로 접근과 새로고침을 처리합니다.
- Pages 빌드 변수는 `github-pages` environment variables에서 검증합니다. `VITE_API_BASE_URL`은 Render 백엔드 오리진이어야 하며 Supabase key를 넣으면 빌드가 실패합니다.
- Render 백엔드는 Supabase `HS256` JWT를 직접 검증하고, 다른 서명 알고리즘 토큰은 Supabase `/auth/v1/user` 확인으로 사용자 id를 가져옵니다.

## Quick Start

Frontend:

```bash
cd frontend
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

기본 API 주소는 `http://127.0.0.1:8000`입니다. 개발 중 프론트엔드는 상대경로 `/api`를 Vite 프록시로 백엔드에 전달합니다.

## Testing

```bash
cd frontend
npm run lint
npm test
npm run build

cd ../backend
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

`main` push와 PR에서는 `.github/workflows/ci.yml`이 위 백엔드(ruff + pytest, PostgreSQL 서비스 포함)와 프론트엔드(eslint + vitest + build) 검증을 자동 실행합니다.

상세 테스트 범위와 smoke test 명령은 [docs/testing.md](docs/testing.md)를 참고하세요. 날짜별 실행 로그는 로컬 `testing.md`에 기록하며 버전 관리에서 제외합니다.

## Architecture

```text
React/Vite frontend
  -> /api
FastAPI backend
  -> SQLite or PostgreSQL
  -> OpenRouter optional AI
```

주요 코드 위치:

- `frontend/`: React 18, TypeScript, Vite, Tailwind CSS
- `backend/`: FastAPI, PyMuPDF, SQLite/PostgreSQL repository
- `frontend/src/components/App.tsx`: 앱 화면 렌더링
- `frontend/src/hooks/useReviewStore.tsx`: 업로드, 등록, 하이라이트, AI 설명 액션
- `backend/app/routers/papers.py`: PDF 추출, 섹션/메타데이터 추정
- `backend/app/routers/notes.py`: 리뷰 노트 CRUD
- `backend/app/routers/ai.py`: OpenRouter 기반 용어 설명 API

상세 구조와 API는 [docs/architecture.md](docs/architecture.md)를 참고하세요.

## Deployment

- Frontend는 GitHub Pages에 배포합니다. `.github/workflows/deploy-pages.yml`가 `main` push 시 `frontend`를 빌드합니다.
- Backend는 Render에 배포합니다. `render.yaml`의 FastAPI 서비스를 사용합니다.
- Pages처럼 백엔드가 다른 오리진일 때는 `VITE_API_BASE_URL`을 빌드 변수로 설정합니다.
- 운영 저장소는 PostgreSQL을 권장합니다. Render 환경변수 `DATABASE_URL`을 설정하세요.
- Supabase Auth를 쓰려면 프론트 빌드 변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`와 백엔드 변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`을 설정하세요.
- AI 용어 설명을 켜려면 Render 환경변수 `AI_API_KEY`를 설정합니다.
- OCR 재추출(손상/스캔 PDF 원문 복구)을 켜려면 `requirements-ocr.txt` 설치 + Render `OCR_ENABLED=true`를 설정합니다(무료 512MB는 OOM 위험, 유료 인스턴스 권장).

상세 환경변수, CORS, PostgreSQL, smoke 절차는 [docs/deployment.md](docs/deployment.md)를 참고하세요.

## Project Structure

```text
backend/                  FastAPI backend
frontend/                 Vite React frontend
demo/                     이전 AI 자동 분석 데모 보관
docs/                     README에서 분리한 운영/구조/검증 문서
docker-compose.postgres.yml
render.yaml
```

제품 기획서:

- `paper_review_service_plan_v4.0.md`: 제품 기획서 (버전 관리 포함). AI 내용 요약 제외, 요약 이외 작업 자동화, 목적별 템플릿 방향을 정의합니다.

로컬 전용 문서:

- `paper_review_service_plan_v3.1.md`: 이전 기획서 (로컬 참조용)
- `testing.md`: 로컬 테스트·검증 로그
- `presentation_content.md`: 발표용 내용 정리

위 파일들은 `.gitignore`로 버전 관리에서 제외합니다.

## Roadmap

- pdf.js 기반 PDF 캔버스 직접 주석
- 요약 템플릿 AI 초안
- 논문 기반 Q&A
- 다중 논문 비교와 인용 네트워크
- 공유, 협업 기능
