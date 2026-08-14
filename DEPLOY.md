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

서비스 `adg-api` (asia-northeast3) 가 이미 떠 있다. 코드 변경 후 재배포는 아래 한 줄이다.

```bash
gcloud run deploy adg-api --source ./backend \
  --project design-gen-zitify --region asia-northeast3 --quiet
```

환경 변수까지 새로 지정하려면 (`^@^` 는 값 안의 쉼표를 구분자로 오인하지 않게 하는 gcloud 문법):

```bash
SECRET=$(grep '^CLOUDRUN_SECRET_KEY=' backend/.env | cut -d= -f2-)
gcloud run deploy adg-api --source ./backend \
  --project design-gen-zitify --region asia-northeast3 \
  --allow-unauthenticated --max-instances 1 --memory 512Mi \
  --set-env-vars "^@^ENVIRONMENT=production@DEBUG=false@FAKE_AI_PIPELINE=true@SEED_ON_STARTUP=true@DATABASE_URL=sqlite+aiosqlite:////tmp/designgen.db@SECRET_KEY=$SECRET@CORS_ORIGINS=https://design-gen-zitify.web.app,https://design-gen-zitify.firebaseapp.com" \
  --quiet
```

Hosting 의 `/api/**` rewrite 가 이 서비스로 넘긴다 (`firebase.json`), 따라서 브라우저는
같은 출처로 API 를 호출하고 CORS 를 타지 않는다.

### 최초 구성에서 걸렸던 것 (재구축 시 참고)

. **결제** — Firebase Spark 로는 Cloud Run 을 못 만든다. `zitifycorp` 결제 계정은
  연결 가능한 프로젝트 5개 상한에 걸려 있어 슬롯을 하나 비운 뒤 연결했다.
. **IAM** — 첫 `gcloud run deploy --source` 는 Compute 기본 서비스 계정의
  소스 버킷 읽기 권한이 없어 403 으로 끊긴다. 아래 4개 역할을 부여하면 통과한다.

```bash
SA="$(gcloud projects describe design-gen-zitify --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for r in roles/cloudbuild.builds.builder roles/storage.objectViewer \
         roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding design-gen-zitify \
    --member="serviceAccount:$SA" --role="$r" --condition=None --quiet
done
```

### 운영 전환 시 반드시 바꿀 것

. `DATABASE_URL` → PostgreSQL (Neon·Supabase·Cloud SQL).
  현재는 컨테이너 `/tmp` 의 SQLite 라 **콜드 스타트·재배포 때 데이터가 사라진다**.
  `SEED_ON_STARTUP=true` 라 데모 계정·플랜은 매번 다시 채워진다.
. `SECRET_KEY` — `backend/.env`(Secrets SSOT 링크) 의 `CLOUDRUN_SECRET_KEY` 를 쓴다.
  값이 바뀌면 기존 토큰이 전부 무효가 된다.
. 실제 AI 생성 — `FAKE_AI_PIPELINE=false` + `GEMINI_API_KEY`/`OPENAI_API_KEY`.
. `--max-instances 1` — SQLite 를 쓰는 동안은 인스턴스가 늘면 DB 가 갈라진다.
  Postgres 로 옮긴 뒤에 상한을 올린다.

---

## 3.5 관측 (로그) · 보안

### 로그 흐름

```
요청 → 미들웨어(trace_id·소요시간) → log_event ─┬→ 콘솔 JSON (Cloud Run 로그)
                                              ├→ app_log_events (로컬 사본, Admin 조회용)
                                              └→ 중앙 로그 허브 (권위 저장소, 배치 전송)
```

. 로그 적재는 **요청 트랜잭션과 분리된 세션**을 쓴다. 요청 세션에 붙이면 로그인 실패·
  쿼터 차단처럼 예외로 끝나는 경로의 이벤트가 롤백과 함께 사라진다.
. 허브 전송 실패는 업무 요청에 영향을 주지 않는다 (버퍼 → 서킷브레이커 → 경고).
. 민감값은 저장 전에 재귀 마스킹하고, IP·행위자는 해시만 남긴다.

Admin → **로그** 화면에서 레벨·종류·기간·검색·추적 ID 로 조회하고, 상단 배너에서
허브 전송기 상태(연동 여부·대기·유실·서킷)를 확인한다.

### 중앙 로그 허브 연결

환경변수 4종으로 켜진다 (값은 `Secrets/env/designgenerator/loghub.env`).

| 키 | 설명 |
|---|---|
| `MAE_LOGHUB_URL` | 허브 주소 |
| `MAE_LOGHUB_KEY` | 프로젝트 전용 서명 키 |
| `MAE_LOGHUB_PROJECT_ID` | `designgenerator` (등록부 식별자와 일치해야 한다) |
| `LOG_SINK_MODE` | `dual`(DB+허브) · `local`(DB만) · `off` |

⚠ **허브 앞단 Cloudflare 가 기본 User-Agent 를 1010 으로 차단한다.** 전송기는 UA 를
반드시 붙인다 — UA 없이 보내면 인증 단계에 닿기도 전에 403 이 떨어진다.

⛔ **현재 허브가 `project_inactive`(403) 로 거절한다.** 등록부(`mst_project`)에서
`designgenerator` 상태가 `suspended` 이기 때문이다 — 서버가 없던 시절에 배선 대상이
아니라고 분류된 상태다. 이제 Cloud Run 백엔드가 있으므로 **마에 쪽에서 `active` 로
전환**해야 로그가 실제로 쌓인다 (허브 관리 API 는 마에 전용이라 이 프로젝트에서
호출하지 않는다).

```
PATCH /admin/projects/designgenerator   { "status": "active" }
```

전환 후 확인: Admin → 로그 상단 배너의 `유실` 이 더 늘지 않으면 전송이 붙은 것이다.

### 적용된 보안 조치

| 영역 | 조치 |
|---|---|
| 인증 | 로그인 5회 실패 → 15분 계정 잠금, 사용자 열거 방지(동일 검증 비용), 리프레시 토큰 1회용 회전·재사용 탐지 로깅, 관리자 잠금 해제 |
| 요청 | 레이트 리밋(로그인 5분 10회·가입 1시간 5회·API 분당 300회), 본문 2MB 상한 |
| 응답 | 보안 헤더 7종, 500 응답에 내부 예외 미노출, 운영에서 `/docs`·`/openapi.json` 비공개 |
| 비밀 | 운영 `SECRET_KEY` 강도 검사 — 약하면 기동 거부. 로그·payload 재귀 마스킹 |
| 호스팅 | CSP·COOP·HSTS·X-Frame-Options·X-Robots-Tag(noindex), `robots.txt` 크롤 차단 |
| 권한 | Admin RBAC 서버 강제, 관리자 조치 전건 감사 로그(t3) |

레이트 리밋은 프로세스 메모리 기반이라 `--max-instances 1` 전제다. 인스턴스를 늘리면
Redis 백엔드로 옮겨야 한다.

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
| 프론트 정적 export | ✅ 30 라우트 |
| Firebase Hosting | ✅ https://design-gen-zitify.web.app |
| 백엔드 Cloud Run | ✅ `adg-api` (asia-northeast3) — Hosting `/api/**` rewrite 연결 |
| 결제 | ✅ Blaze — `zitifycorp` 결제 계정 |
| DB | ⚠ 컨테이너 `/tmp` SQLite — **콜드 스타트·재배포 시 초기화** |
| AI 생성 | ⚠ `FAKE_AI_PIPELINE=true` — placeholder 출력 |
| 로그 적재 | ✅ 로컬 DB + Admin 로그 화면 |
| 중앙 로그 허브 | ⛔ 전송 시도 중이나 허브가 `project_inactive` 로 거절 (§3.5) |
| 보안 하드닝 | ✅ 인증·레이트리밋·헤더·CSP·크롤 차단 (§3.5) |

라이브 E2E 확인 (2026-08-14): 로그인 → 프로젝트 생성(단일 DS·대시보드) → 생성 완료
(15 시안, 화면축 단일·구조 변형 5종) → 컨셉 확정 → 화면 추가(로그인 3종) → Export(json).

### 남은 일

1. **허브 활성화** — `designgenerator` 를 `active` 로 전환해야 중앙 로그가 쌓인다 (§3.5).
   지금은 로컬 DB 사본만 남고, 그 사본도 컨테이너가 내려가면 사라진다.
2. **DB 를 PostgreSQL 로** — 지금은 사용자가 만든 프로젝트가 콜드 스타트 후 사라진다.
   Neon 무료 티어에 DB 를 만들고 `DATABASE_URL` 만 바꿔 재배포하면 된다
   (`asyncpg` 는 `requirements.txt` 에 주석으로 준비돼 있으니 주석을 푼다).
3. **실제 AI 생성** — `FAKE_AI_PIPELINE=false` + 프로바이더 키.
4. **커스텀 도메인** — Hosting 에 도메인 연결 시 백엔드 `CORS_ORIGINS` 에도 추가.
