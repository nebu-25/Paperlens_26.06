---
name: verify
description: PaperLens 프론트엔드 변경을 실제 브라우저에서 구동해 검증하는 레시피 (dev 서버 + Playwright)
---

# PaperLens 프론트 검증 레시피

## 구동

```bash
cd frontend && npm ci
# 인증 가드 통과용 가짜 Supabase env (아래 세션 주입과 ref가 일치해야 함)
VITE_SUPABASE_URL=https://testref.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_test nohup npm run dev &
```

- dev base path는 `http://127.0.0.1:5173/Paperlens_26.06/` (vite base 설정). 루트가 아님.
- 워크스페이스는 `/Paperlens_26.06/service_home/`. **accessToken 없으면 랜딩으로 리다이렉트**됨.

## 로그인 없이 워크스페이스 진입 (백엔드 불필요)

랜딩(`/Paperlens_26.06/`)에서 localStorage 주입 후 `service_home/` 이동:

1. `sb-testref-auth-token` — supabase-js 저장 세션 형태
   `{ access_token, token_type:'bearer', expires_at:<미래 epoch>, refresh_token, user:{ id, aud:'authenticated', ... } }`
2. `paperlens:v1` — `{ library:{id:Paper}, notes:{id:ReviewNote}, activeId, dirtyIds:[], textDirtyIds:[], deletedIds:[] }`

백엔드가 없으면 `/api` 프록시가 502를 내며 콘솔에 "Failed to load resource" 다수 발생 — 의도된
localStorage 폴백 경로이므로 노이즈. `pageerror`(JS 크래시)만 실패 신호로 취급할 것.

## 주의 (race)

워크스페이스가 마운트된 상태에서 `paperlens:v1`을 스크립트로 수정하면 앱의 dirty 재시도 저장이
곧바로 덮어쓴다. 저장 데이터를 조작하는 프로브는 **랜딩으로 이동해 스토어를 언마운트한 뒤** 수정하고
재진입할 것.

## Playwright

전역 모듈 사용: `createRequire('/opt/node22/lib/node_modules/')('playwright')`,
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. viewport는 2-패널 레이아웃(xl)을
위해 1600×1000 이상.
