# AI Design Generator — Frontend (Web App)

Next.js 14 App Router 정적 export 프론트엔드다. 기획서 v0.5.2 · 기능정의서 v0.2.2 의
Web App 메뉴를 구현하며, API 는 같은 출처 `/api/v1` (로컬은 `localhost:8000`) 로
FastAPI 에 붙는다.

## 기술 스택

- Next.js 14.2.35 (App Router) + React 18 + TypeScript 5
- Tailwind CSS 3 — 색은 `globals.css` CSS 변수. 다크는 `.dark` 에서 값을 뒤집는다
- Zustand 4 (`auth` · `project` · `workspace` · `notification`)
- HTTP 진입점은 `src/lib/api.ts` 한 곳. 토큰은 HttpOnly 쿠키 (구 localStorage 키는 기동 시 삭제)

## 실행

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000  → API http://localhost:8000/api/v1
NEXT_STATIC_EXPORT=1 npm run build   # → out/  (Hosting 배포용)
npx tsc --noEmit
```

백엔드가 없으면 화면은 뜨지만 데이터는 "API 서버에 연결되지 않았습니다" 로 바뀐다.

## 화면 구성

| 경로 | 화면 |
|---|---|
| `/login`, `/signup` | 로그인·회원가입 (허니팟 `website`, 2FA 2단계) |
| `/dashboard` | 프로젝트 그리드·사용량·공지 배너 |
| `/projects/new` | 요건 입력·생성 옵션 (컨셉·시안·DS 방식·대상 화면) |
| `/projects/[id]` | Workspace (DS 컨트롤러 + 시안 뷰어 + 확정·화면 추가) |
| `/projects/[id]/export` | Export 대상·형식·미리보기·이력 |
| `/templates`, `/templates/[id]` | 템플릿 마켓·리뷰 |
| `/notifications` | 알림 센터 |
| `/me/profile` · `subscription` · `credits` · `usage` · `security` · `notifications` · `api-keys` | 마이페이지 |
| `/admin/...` | 관리자 (서버 RBAC) |
| `/help` | 도움말·FAQ |

동적 라우트는 빌드 때 `__id__` 센티넬 한 벌만 프리렌더한다 (`lib/route-sentinel.ts`).

## 디자인 시스템 실시간 반영

`workspace-store` 의 Token 을 `--ds-*` CSS 변수로 시안 캔버스에 넣는다. 컨트롤러에서
고치면 같은 프레임에서 다시 그린다. 시안 캔버스는 앱 테마를 따르지 않는다.

## 인증

브라우저는 access/refresh 를 HttpOnly 쿠키로 받는다. 변이 요청은 Origin CSRF 를 탄다.
Bearer 는 스모크·스크립트용이다. 2FA 를 켠 계정은 TOTP 또는 백업 코드가 있어야 로그인된다.

## 미구현 (의도)

- Figma Plugin (별도 저장소, 아직 없음)
- Stripe Checkout (백엔드 501)
- i18n ko/en
- `subscribe_token_changes` (Public API / MCP)
