# PaperLens

사용자가 직접 작성하는 논문 리뷰 노트 도구입니다. `paper_review_service_plan_v3.1.md` 기준으로 AI 없이 동작하는 코어 MVP를 먼저 개발하도록 환경을 분리했습니다.

## 현재 진행 사항

- `paper_review_service_plan_v3.1.md`를 기준으로 Phase 1 코어 MVP 개발 환경을 구성했습니다.
- 정본 화면은 `frontend/` React 앱으로 단일화했고, 기존 루트의 AI 자동 분석 데모는 `demo/index.html`로 옮겨 Phase 2 AI 보조 레이어 참고 자산으로 보존합니다.
- 프론트엔드는 기획서 화면 2(원문/리뷰 노트 좌우 2분할)와 리뷰 노트 9영역을 구현했습니다. 본문 드래그 → 하이라이트/용어 추가, 5초 자동 저장, AI 보조 버튼 "준비 중" 비활성 등 코어 UX가 AI 없이 동작합니다.
- 리뷰 노트는 브라우저 localStorage(`paperlens:v1`)에 **논문별로 분리 저장**되며, 새로고침 시 목록·작성 내용이 **자동 복원**됩니다. 사이드바에서 저장된 노트를 전환·삭제할 수 있습니다. (영구 저장소 PostgreSQL 연동은 후속 작업)
- 리뷰 노트 패널은 작성 흐름에 맞춰 **읽으며 캡처**(하이라이트·용어·질문·섹션 메모)와 **내 언어로 정리**(한 줄 요약·요약) 두 묶음으로 그룹화했습니다. 섹션별 요약과 5문항 템플릿은 **토글로 택1**(양쪽 데이터 보존), 각 영역은 **접기/펼치기**, 하단 **완성도 체크리스트**로 작성 진행도를 표시합니다.
- 완성한 리뷰 노트는 **Markdown 다운로드** 또는 **PDF로 저장**(인쇄 대화상자)으로 내보낼 수 있습니다(FR-11). 추가 라이브러리 없이 동작하며, 요약 토글과 무관하게 작성된 섹션별 요약·템플릿을 모두 포함합니다.
- 백엔드는 FastAPI 기반으로 구성하고, PDF 업로드 후 PyMuPDF로 텍스트를 추출하는 기본 API를 추가했습니다.
- AI 기능은 기획서 방향대로 미연동 상태를 전제로 두고, 코어 작성 UX가 먼저 동작하도록 구성했습니다.
- 개발 서버 실행과 빌드/컴파일 검증을 완료했습니다. 검증 절차는 아래 "검증" 섹션을 참고하세요. (상세 실행 로그는 로컬 `testing.md`에 기록하며, 이 파일은 버전 관리에서 제외됩니다.)

## 프로젝트 구조

- `frontend/`: Vite + React 18 + TypeScript + Tailwind CSS (정본 화면)
- `backend/`: FastAPI + PyMuPDF 기반 PDF 텍스트 추출 API
- `demo/index.html`: 기존 AI 자동 분석 단일 파일 데모 (Phase 2 참고용)
- `paper_review_service_plan_v3.1.md`: 제품 기획서
- `testing.md`: 로컬 테스트·검증 기록 (버전 관리 제외, 각자 로컬에서 유지)

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

아래 명령으로 빌드·컴파일을 검증할 수 있습니다. 상세 실행 로그는 로컬 `testing.md`에 정리하며, 이 파일은 버전 관리에서 제외됩니다(공유 대상 아님).

```bash
cd frontend
npm run build

cd ../backend
source .venv/bin/activate
python -m compileall app
```
