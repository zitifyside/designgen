# 배포 가이드 — AI Design Generator

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0.0 |
| 작성일 | 2026-08-14 |
| 대상 | Firebase Hosting (프론트) + Cloud Run (백엔드 API) |
| Firebase 프로젝트 | `design-gen-zitify` |
| GitHub 저장소 | `zitifycorp/design-gen` |

---

## 1. 구성

```
[브라우저] ──▶ Firebase Hosting (정적 Next.js export)
                     │
                     └─ /api/**  rewrite ──▶ Cloud Run (FastAPI)  ──▶ DB
```

. **프론트엔드** : Next.js 14 App Router. 배포 빌드만 `output: "export"` (정적) 로 굽는다.
. **백엔드** : FastAPI. Firebase Hosting 은 서버 코드를 실행하지 못하므로 Cloud Run 등 별도 런타임이 필요하다.
. **API 주소** : `NEXT_PUBLIC_API_BASE_URL`. 정적 export 빌드의 기본값은 `/api/v1` 상대 경로이며
  (`frontend/next.config.mjs`), Hosting rewrite 로 Cloud Run 에 붙이면 CORS 없이 동일 출처로 동작한다.
  다른 도메인에 백엔드를 두면 빌드 시 절대 URL 을 넘긴다 —
  `NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1 NEXT_STATIC_EXPORT=1 npm run build`

### 동적 라우트와 정적 export

`/projects/[id]`·`/projects/[id]/export`·`/templates/[id]` 는 빌드 시점에 ID 를 알 수 없다.
센티널 경로(`__id__`) 하나만 프리렌더하고 Hosting rewrite 로 실제 URL 을 그 HTML 에 매핑하며,
실제 ID 는 클라이언트가 주소에서 읽는다 (`frontend/src/lib/route-id.ts`).

---

## 2. 프론트엔드 배포 (Firebase Hosting)

```bash
# 1) 정적 export 빌드
cd frontend
NEXT_STATIC_EXPORT=1 npm run build      # → frontend/out

# 2) 배포 (저장소 루트에서) — gcloud 로그인 계정을 그대로 쓴다
cd ..
python scripts/deploy_hosting.py
```

⚠ `NEXT_STATIC_EXPORT=1` 없이 빌드하면 `frontend/out` 이 생기지 않아 배포가 빈 사이트가 된다.

### 왜 `firebase deploy` 가 아니라 스크립트인가

이 머신의 firebase CLI 에는 인증된 계정이 없고(`firebase login` 미실행), CLI 는
gcloud ADC 를 그대로 받아들이지 않아 `Failed to get Firebase project` 로 끊긴다.
`scripts/deploy_hosting.py` 는 Hosting REST API 를 직접 호출하며,
gcloud 액세스 토큰 + `x-goog-user-project` 헤더로 동일한 배포(버전 생성 → 파일 업로드 →
확정 → 릴리즈)를 수행한다. firebase.json 의 CLI 표기(source/destination·헤더 배열)를
REST ServingConfig(glob/path·헤더 맵)로 변환하는 계층도 이 스크립트 안에 있다.

`firebase login` 을 한 뒤에는 표준 CLI 명령도 그대로 쓸 수 있다.

```bash
firebase login
firebase deploy --only hosting --project design-gen-zitify
```

---

## 3. 백엔드 배포 (Cloud Run)

```bash
gcloud auth login
gcloud config set project design-gen-zitify

# 이미지 빌드 + 배포
gcloud run deploy adg-api \
  --source ./backend \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=production,DEBUG=false,FAKE_AI_PIPELINE=true" \
  --set-secrets "SECRET_KEY=adg-secret-key:latest,DATABASE_URL=adg-database-url:latest"
```

. `SECRET_KEY` 는 반드시 교체한다 (기본값은 개발용 플레이스홀더).
. `DATABASE_URL` 은 Cloud SQL(PostgreSQL) 연결 문자열로 바꾼다 —
  SQLite 기본값은 컨테이너 재시작 시 데이터가 사라진다.
. 실제 AI 생성을 켜려면 `FAKE_AI_PIPELINE=false` + `GEMINI_API_KEY`/`OPENAI_API_KEY` 를 넣는다.

배포 후 Hosting 에 rewrite 를 추가한다 (`firebase.json` → `hosting.rewrites` 맨 앞):

```json
{
  "source": "/api/**",
  "run": { "serviceId": "adg-api", "region": "asia-northeast3" }
}
```

⚠ 이 rewrite 는 Cloud Run 서비스가 존재해야 배포가 통과한다. 그래서 기본 `firebase.json` 에는 넣지 않았다.

---

## 4. 배포 전 점검

- [ ] `cd backend && python -m app.seed` — 초기 플랜·계정 시드 (신규 DB 한정)
- [ ] `cd frontend && npx tsc --noEmit` — 타입 게이트
- [ ] `NEXT_STATIC_EXPORT=1 npm run build` — 정적 export 생성 확인
- [ ] 백엔드 `CORS_ORIGINS` 에 배포 도메인 추가 (`https://design-gen-zitify.web.app`)
- [ ] `SECRET_KEY`·DB·AI 키를 운영 값으로 교체

---

## 5. 현재 상태 (2026-08-14)

| 구성 | 상태 |
|---|---|
| 프론트 정적 export | ✅ 빌드 검증 완료 (30 라우트) |
| Firebase Hosting | ✅ 배포됨 — https://design-gen-zitify.web.app |
| 백엔드 Cloud Run | ⛔ **미배포 — 프로젝트 결제(Blaze) 미연결** |
| DB | ⏸ 로컬 SQLite. 운영은 PostgreSQL 로 전환 필요 |

⚠ **현재 배포본은 UI 만 동작한다.** `design-gen-zitify` 는 Spark(무료) 요금제라
Cloud Run·Functions 를 만들 수 없어 API 백엔드가 없다. 로그인·생성·Export 등
서버가 필요한 기능은 "서버에 연결하지 못했습니다" 로 끝난다.

기능을 살리려면 둘 중 하나가 필요하다.

1. **Blaze 요금제 연결** 후 §3 절차로 Cloud Run 배포 + Hosting `/api/**` rewrite 추가
2. 백엔드를 **다른 호스트**(Render·Railway·Fly.io·자체 서버)에 올리고
   `NEXT_PUBLIC_API_BASE_URL=https://<백엔드>/api/v1` 로 다시 빌드 + 백엔드
   `CORS_ORIGINS` 에 `https://design-gen-zitify.web.app` 추가
