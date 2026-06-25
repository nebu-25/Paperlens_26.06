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
- Pages workflow는 VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 형식을 검증합니다.
- 샘플 PDF 버튼은 Render 콜드스타트 중 "샘플 PDF 준비 중" 안내를 표시합니다.

최근 확인된 배포/설정 주의점:
- VITE_API_BASE_URL은 반드시 https://paperlens-backend-53ki.onrender.com 이어야 합니다.
- VITE_SUPABASE_URL은 https://<project-ref>.supabase.co 형식입니다.
- VITE_SUPABASE_ANON_KEY는 sb_publishable_... 값입니다.
- Render에는 SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET이 모두 필요합니다.
- /service_home 직접 접근은 /service_home/로 redirect된 뒤 200이어야 합니다.

우선순위 개선 작업:
1. 운영 환경 smoke test 정리
   - 로그인 후 /api/notes 200 여부 확인
   - 샘플 PDF 등록 전체 흐름 확인
   - DOI/URL 등록 흐름 확인
   - 로그아웃 후 /service_home 접근 시 랜딩으로 되돌아가는지 확인
   - 결과를 docs/testing.md 또는 별도 운영 체크리스트에 반영

2. 인증/저장 UX 개선
   - /api/notes 401/503 발생 시 사용자에게 원인별 안내 표시
   - "인증 토큰 확인 실패", "Render 콜드스타트", "오프라인 로컬 저장" 상태를 구분
   - 자동 저장 상태 문구를 더 짧고 명확하게 정리

3. 샘플 PDF UX 개선
   - 샘플 PDF 로딩이 오래 걸릴 때 남은 동작을 설명
   - 중복 클릭 방지와 취소/재시도 UX 검토
   - 가능하면 백엔드 health를 먼저 깨운 뒤 sample-pdf를 호출하는 방식 검토

4. 랜딩 페이지 polish
   - 로그인된 사용자가 루트 랜딩에 들어왔을 때 "서비스로 이동" CTA를 더 명확하게 배치
   - 모바일에서 로그인 카드와 설명 카드 간격 확인
   - 헤더의 compact auth UI가 좁은 화면에서 사라지는 문제를 모바일 메뉴/아이콘으로 개선

5. 백엔드 인증 검증 개선
   - Supabase /auth/v1/user fallback 호출 결과 캐싱 여부 검토
   - 503/401 에러 메시지와 로그 구분
   - Render 환경변수 누락 시 health 또는 별도 diagnostics에서 감지하는 방법 검토

6. 문서와 배포 자동화
   - docs/deployment.md의 환경변수 표를 실제 운영값 기준으로 재확인
   - GitHub Actions가 Pages 관련 변경이 없을 때도 빌드되는 점을 최적화할지 검토
   - Render 배포 성공 여부를 확인하는 smoke script 또는 GitHub Action 추가 검토

검증 명령:
- cd frontend && npm run lint
- cd frontend && npm run build
- backend/.venv/bin/python -m pytest backend/tests/test_auth.py
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/service_home/
- curl -L -I https://nebu-25.github.io/Paperlens_26.06/favicon.svg
- curl https://paperlens-backend-53ki.onrender.com/api/health
- curl -L -I https://paperlens-backend-53ki.onrender.com/api/papers/sample-pdf

작업 방식:
- 기존 코드 스타일과 컴포넌트 구조를 유지하세요.
- 사용자 데이터 보존을 최우선으로 두고 destructive git 명령은 쓰지 마세요.
- 수정 후 관련 테스트/빌드를 실행하고, 실패하면 원인을 문서화하세요.
- 배포 설정 변경은 docs/deployment.md에 같이 반영하세요.
```
