# PaperLens

사용자가 직접 작성하는 논문 리뷰 노트 도구입니다. `paper_review_service_plan_v3.1.md` 기준으로 AI 없이 동작하는 코어 MVP를 먼저 개발하도록 환경을 분리했습니다.

## 현재 진행 사항

- `paper_review_service_plan_v3.1.md`를 기준으로 Phase 1 코어 MVP 개발 환경을 구성했습니다.
- 기존 루트의 `index.html` 단일 파일 데모는 유지하고, 신규 개발용 앱은 `frontend/`와 `backend/`로 분리했습니다.
- 프론트엔드는 Vite + React 18 + TypeScript + Tailwind CSS 기반으로 초기 화면 골격을 추가했습니다.
- 백엔드는 FastAPI 기반으로 구성하고, PDF 업로드 후 PyMuPDF로 텍스트를 추출하는 기본 API를 추가했습니다.
- AI 기능은 기획서 방향대로 미연동 상태를 전제로 두고, 코어 작성 UX가 먼저 동작하도록 구성했습니다.
- 개발 서버 실행과 빌드/컴파일 검증을 완료했습니다. 자세한 검증 기록은 `testing.md`를 확인하세요.

## 프로젝트 구조

- `frontend/`: Vite + React 18 + TypeScript + Tailwind CSS
- `backend/`: FastAPI + PyMuPDF 기반 PDF 텍스트 추출 API
- `index.html`: 기존 단일 파일 데모
- `paper_review_service_plan_v3.1.md`: 제품 기획서
- `testing.md`: 테스트 및 검증 기록

## 주요 추가 파일

- `frontend/package.json`: 프론트엔드 의존성 및 실행 스크립트
- `frontend/src/main.tsx`: PaperLens 초기 앱 화면
- `frontend/src/styles.css`: Tailwind 엔트리 스타일
- `backend/app/main.py`: FastAPI 앱 엔트리포인트
- `backend/app/routers/papers.py`: PDF 텍스트 추출 API
- `backend/requirements.txt`: 백엔드 Python 의존성
- `.gitignore`: 의존성, 빌드 산출물, 환경 변수 제외 설정

## 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:5173`입니다.

## 백엔드 실행

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

기본 API 주소는 `http://127.0.0.1:8000`입니다.

## API 확인

```bash
curl http://127.0.0.1:8000/api/health
```

예상 응답:

```json
{"status":"ok"}
```

## 검증

테스트 및 검증 기록은 `testing.md`에 별도로 정리했습니다.

```bash
cd frontend
npm run build

cd ../backend
source .venv/bin/activate
python -m compileall app
```
