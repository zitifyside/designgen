# AI Design Generator — Frontend (Web App)

Next.js 14 App Router 기반의 Web App 프론트엔드이다. 기획서 v0.1.0 의 §5 UI/UX 설계 와 기능정의서 §2.1 Web App 메뉴 트리를 구현 대상으로 한다. 이번 단계는 백엔드 없이 Mock 데이터로만 동작하는 UI 스켈레톤이다.

## 기술 스택

- Next.js 14 (App Router) + React 18 + TypeScript 5
- Tailwind CSS 3
- Zustand 4 (Design Token 전역 상태 + Reactive Binding)
- Mock 데이터 (`src/lib/mock-data.ts`)

## 실행

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build        # 프로덕션 빌드
```

## 화면 구성

| 경로 | 화면 | 출처 |
|---|---|---|
| `/login`, `/signup` | 로그인·회원가입 | 기능정의서 §3.1 (Web App) |
| `/dashboard` | 대시보드 (즐겨찾기·프로젝트 그리드·사용량) | 기획서 §5 화면 1 |
| `/projects/new` | 새 프로젝트 (요건 입력) | 기획서 §5 화면 2 |
| `/projects/new/generating` | AI 생성 진행 (4단계 progress) | 기능정의서 3.1 — 생성 진행 |
| `/projects/[id]` | Workspace (DS 컨트롤러 + 시안 뷰어) | 기획서 §5 화면 3 |
| `/projects/[id]/export` | Export (대상·형식·해상도·이력) | 기획서 §5 화면 4 |
| `/templates`, `/templates/[id]` | 템플릿 마켓 | 기능정의서 §3.1 — 템플릿 마켓 |
| `/notifications` | 알림 센터 | 기능정의서 §3.1 — 알림 센터 |
| `/me/profile`, `/me/subscription`, `/me/credits`, `/me/api-keys`, `/me/usage`, `/me/security`, `/me/notifications` | 마이페이지 7개 서브 | 기능정의서 §3.1 — 마이페이지 |

## 디자인 시스템 실시간 반영

`workspace-store` 의 DS Token 을 CSS Variables(`--ds-color-primary`, `--ds-spacing-md` 등) 로 변환하여 시안 캔버스에 주입한다. User 가 좌측 컨트롤러에서 Token 을 수정하면 캔버스의 시안이 같은 프레임 안에서 다시 그려진다 — 500ms 이내 반영(기획서 F-004) 의 클라이언트 측 메커니즘이다.

## Mock 데이터

- 컨셉 3종 × 시안 5종 = 총 15종 시안을 Mock 으로 제공한다 (Modern Minimal / Bold Vibrant / Soft Pastel)
- 시안은 Canvas/Fabric.js 가 아닌 React 컴포넌트 + CSS 변수로 렌더링하여 Token 수정 시 즉시 재반영된다
- 인증은 LocalStorage 의 `loggedIn` 플래그로만 처리한다 (실제 JWT/OAuth 미적용)

## 백엔드 연동 시 변경 지점

- `src/store/*` 의 Mock 호출을 `fetch` 로 교체
- `src/lib/api.ts` (예정) 에 FastAPI 엔드포인트 매핑
- 인증은 JWT Access/Refresh 페어 + Cookie/Authorization 헤더로 교체

## 미구현 (의도적 제외)

- Figma Plugin (별도 Vite 프로젝트)
- Admin (별도 빌드 분리 또는 동일 앱 권한 분기 — TBD)
- 실제 Canvas 시안 뷰어 (Fabric.js·Konva.js) — CSS 기반 시안으로 대체
- 실제 결제 (Stripe Checkout)
- 실제 AI 호출 (서버에서 Mock·실제 모두 처리 가능하도록 분리)
