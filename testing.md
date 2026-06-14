# Testing

작성일: 2026-06-14

## 환경

- OS/셸: WSL bash 환경
- Node.js: `v22.22.1`
- npm: `9.2.0`
- Python: `Python 3.14.4`

## 실행한 검증

### 1. 프론트엔드 의존성 설치

```bash
cd frontend
npm install
```

결과:

- 설치 완료
- 초기 설치 직후 `npm audit`에서 Vite/esbuild 관련 high 취약점 3건 확인
- `vite@latest`, `@vitejs/plugin-react@latest` 업데이트 후 취약점 0건 확인

### 2. 프론트엔드 빌드

```bash
cd frontend
npm run build
```

결과:

- 통과
- Vite `v8.0.16` 기준 production build 완료

### 3. 프론트엔드 보안 감사

```bash
cd frontend
npm audit --omit=dev
```

결과:

```text
found 0 vulnerabilities
```

### 4. 백엔드 가상환경 및 의존성 설치

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

결과:

- 설치 완료
- FastAPI 파일 업로드 라우트에서 `python-multipart` 필요성이 확인되어 `requirements.txt`와 `pyproject.toml`에 추가

### 5. 백엔드 컴파일 확인

```bash
cd backend
.venv/bin/python -m compileall app
```

결과:

- 통과

### 6. 백엔드 앱 import 확인

```bash
cd backend
.venv/bin/python -c "from app.main import app; print(app.title)"
```

결과:

```text
PaperLens API
```

### 7. 개발 서버 실행 확인

백엔드:

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

프론트엔드:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

결과:

- 백엔드 실행 주소: `http://127.0.0.1:8000`
- 프론트엔드 실행 주소: `http://127.0.0.1:5173`

### 8. API health check

```bash
curl -sS http://127.0.0.1:8000/api/health
```

결과:

```json
{"status":"ok"}
```

### 9. 프론트엔드 HTTP 응답 확인

```bash
curl -I http://127.0.0.1:5173
```

결과:

- `HTTP/1.1 200 OK`

## 참고 사항

- 샌드박스 기본 권한에서는 네트워크 접근과 로컬 포트 바인딩이 제한되어, 패키지 설치와 개발 서버 실행은 권한 상승 후 진행했습니다.
- 루트의 기존 `index.html`은 작업 전부터 수정된 상태였고, 이번 개발 환경 설정 작업에서는 변경하지 않았습니다.
