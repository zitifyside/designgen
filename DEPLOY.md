# 배포 가이드 — AI Design Generator

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.1.8 |
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

# 2) 배포 (저장소 루트에서)
cd ..
GCLOUD_ACCOUNT=zitifycorp@gmail.com python scripts/deploy_hosting.py
```

⚠ `NEXT_STATIC_EXPORT=1` 없이 빌드하면 `frontend/out` 이 갱신되지 않는다. 이때 배포는
실패하지 않고 **직전 빌드 결과를 그대로 다시 올린다** — "업로드 필요 0개" 가 뜨면 export
플래그를 빠뜨린 것이다.

⚠ 이 머신에는 Google 계정이 여러 개 로그인돼 있고 gcloud 활성 계정이 다른 프로젝트를
가리킬 수 있다. 활성 계정을 바꾸면 다른 작업에 영향을 주므로 `GCLOUD_ACCOUNT` 로 호출
단위 지정만 한다. 계정이 틀리면 버전 생성에서 `USER_PROJECT_DENIED` 403 이 난다.

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

서비스 `adg-api` (asia-northeast3) 가 이미 떠 있다. sidecar(`cloudflared`) 가
붙어 있으므로 **`gcloud run deploy --source` 는 쓰지 않는다.** 그 명령은
앱만 다시 만들고 sidecar 를 떨어뜨린다.

코드 변경 후 앱 이미지만 갱신한다.

```bash
py -3 backend/scripts/deploy_cloudrun_app_keep_sidecar.py
```

이미 빌드한 태그만 올릴 때는 `--image <태그>` 를 붙인다.

환경 변수까지 새로 지정하려면 (`^@^` 는 값 안의 쉼표를 구분자로 오인하지 않게 하는 gcloud 문법).
⚠ 아래 `--source` 예시는 **sidecar 이전 최초 구성용**이다. 지금 운영 서비스에는 쓰지 않는다:

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
  `SEED_ON_STARTUP=true` 이면 플랜·템플릿·데모 계정(`demo@designgenerator.io`)을 다시 채운다.
  **운영(`ENVIRONMENT=production`)에서는 공개 관리자만 만들지 않고**, 이미 있으면 정지·세션 폐기한다.
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

✅ **허브 등록부에서 `designgenerator` 는 `active` 다** (2026-08-19 전환, 이전 값은
`suspended`). Cloud Run 프로브 이후 허브에 `http.request` 가 적재된 것을 확인했다.
재전환이 필요하면 마에 로컬 관리 API 만 쓴다.

```
PATCH /admin/projects/designgenerator   { "status": "active" }
```

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

## 3.6 Public API · MCP Server

발급된 API Key 로 코딩 도구(Cursor·Claude Code)가 확정 토큰·시안 구조를 직접 읽는
경로다 (기획서 v0.5.0 §4 F-204). 웹 세션(JWT)과는 인증 표면을 나눠 두었다.

| MCP Tool | REST |
|---|---|
| `list_projects` | `GET /api/v1/public/projects` |
| `get_design_tokens` | `GET /api/v1/public/projects/{id}/tokens` (W3C DTCG) |
| `get_mockup_context` | `GET /api/v1/public/projects/{id}/mockups` |
| `get_component_styles` | `GET /api/v1/public/projects/{id}/components` |
| `subscribe_token_changes` | 미구현 (v1.0 로드맵) |

. **읽기 전용** — 쓰기 경로를 두지 않아 키가 유출돼도 자원이 바뀌지 않는다
. **Pro 이상** — Free 는 키 발급 자체가 막힌다. 한도는 Pro 분당 300회·Team 600회
. **소유권 격리** — 타인 프로젝트는 403 이 아니라 404 로 답해 존재 여부도 흘리지 않는다
. **즉시 회수** — 웹에서 키를 회수하면 다음 호출부터 401

MCP 어댑터는 `mcp/adg-mcp-server.mjs` (Node 18+, 무의존성) 이며 설정·점검 절차는
[mcp/README.md](mcp/README.md) 에 있다. 계약의 진원은 백엔드
`backend/app/api/routes/public_api.py` 한 곳이고 어댑터는 그 위를 덮는 얇은 층이다.

```bash
# 배포본 확인 (키는 웹 → 설정 → API Key 에서 발급)
curl -H "X-API-Key: adg_xxxx.xxxx" \
  https://design-gen-zitify.web.app/api/v1/public/projects
```

---

## 4. 배포 전 점검

- [ ] `cd backend && python -m app.seed` — 초기 플랜·계정 시드 (신규 DB 한정)
- [ ] `cd frontend && npx tsc --noEmit` — 타입 게이트
- [ ] `NEXT_STATIC_EXPORT=1 npm run build` — 정적 export 생성 확인
- [ ] 백엔드 `CORS_ORIGINS` 에 배포 도메인 추가 (`https://design-gen-zitify.web.app`)
- [ ] `SECRET_KEY`·DB·AI 키를 운영 값으로 교체

---

## 5. 현재 상태 (2026-08-16)

| 구성 | 상태 |
|---|---|
| 프론트 정적 export | ✅ 30 라우트 |
| Firebase Hosting | ✅ https://design-gen-zitify.web.app |
| 백엔드 Cloud Run | ✅ `adg-api` (asia-northeast3) — Hosting `/api/**` rewrite 연결 |
| 결제 | ✅ Blaze — `zitifycorp` 결제 계정 |
| DB | ✅ Cloud Run `adg-api-00023-jbk` → cloudflared sidecar → 맥미니 PostgreSQL `designgenerator`. 5432 미개방. 왕복 약 350ms (§6) |
| AI 생성 | ✅ Cloud Run `FAKE_AI_PIPELINE=false` · `AI_PROVIDER=gemini`. 로컬은 마에 CLI 사다리 |
| 로그 적재 | ✅ 로컬 DB + Admin 로그 화면 |
| 중앙 로그 허브 | ✅ `designgenerator` `active`. 프로브 후 `http.request` 적재 확인 (§3.5) |
| 보안 하드닝 | ✅ 인증·쿠키/CSRF·레이트리밋·헤더·CSP·봇 UA·크롤 함정 (§3.5·SECURITY.md) |
| DA 스키마 | ✅ BIGINT PK+public_id · C-코드 30종 · 논리삭제 뷰 · SCD · Alembic `202608161200`·`202608161400` |
| Public API · MCP | ✅ Tool 4종 동작 · `subscribe_token_changes` 만 미구현 (§3.6) |
| 공통 기능 | ✅ 도움말·FAQ · 온보딩 투어 · 단축키·Undo · 공지 배너 · 테마(Light·Dark·System) |
| i18n (ko/en) | ✅ 프론트 t() + ko/en JSON. 헤더 KO/EN 전환. 시안 캔버스 카피·429 에러 문구까지 키로 전환. 루트 메타 description 만 잔여 |

라이브 E2E 확인 (2026-08-14): 로그인 → 프로젝트 생성(단일 DS·대시보드) → 생성 완료
(15 시안, 화면축 단일·구조 변형 5종) → 컨셉 확정 → 화면 추가(로그인 3종) → Export(json).

배포본 Public API 확인 (2026-08-15): 키 발급 → 인증 경계(무키·위조 키 401) →
`list_projects` → 생성·컨셉 확정 → 토큰(DTCG)·시안(화면 1종/변형 3건)·컴포넌트 4종 →
타 프로젝트 404 → 키 회수 후 401. 11항목 전부 통과.

### 남은 일

1. **커스텀 도메인** — Hosting 에 도메인 연결 시 백엔드 `CORS_ORIGINS` 에도 추가. 호스트명이 필요하다.
2. **i18n 잔여** — 루트 메타 description. 정적 export 라 빌드 시점에 로케일이 하나로 고정되므로,
   문서 언어를 나누려면 로케일별 HTML 을 따로 굽거나 클라이언트에서 갈아 끼워야 한다.

---

## 6. PostgreSQL 전환 (맥미니 자체 호스팅)

`/tmp` SQLite 는 콜드 스타트·재배포 때마다 사라진다. 데모로는 돌아가지만 사용자가
만든 프로젝트가 없어지므로 운영에서는 반드시 바꿔야 한다. **운영 DB 는 맥미니에
직접 올린다** (운영자 결정 2026-08-16). Cloud Run 리비전 `adg-api-00023-jbk` 부터
앱은 sidecar 로 이 Postgres 에 붙는다. 5432 는 인터넷에 열지 않는다.

### 6.1 준비 상태

| 항목 | 상태 |
|---|---|
| `asyncpg` | ✅ `requirements.txt` 활성화 |
| 연결 문자열 보정 | ✅ 드라이버 자동 지정 · libpq 파라미터 흡수 · **libpq 그대로의 SSL 모드** |
| 유휴 연결 대응 | ✅ `pool_pre_ping` · `pool_recycle` |
| 전체 스모크 | ✅ **PostgreSQL 16 실측 통과** (SQLite 와 동일 결과) |
| 사전 점검 도구 | ✅ `scripts/check_db.py` |
| 맥미니 DB·앱 역할 | ✅ `designgenerator` / `designgenerator_app` (postgresql@18, LAN `192.168.0.5`) |
| 스키마·시드 | ✅ Alembic head + 플랜·데모 시드 (public 테이블 31) |
| 백업 목록 | ✅ `MACDB_BACKUP_DATABASES` 에 `designgenerator` 편입 |
| Cloud Run 경로 | ✅ 리비전 `adg-api-00023-jbk`. sidecar `cloudflared access tcp`, 앱은 `127.0.0.1:5432`. 5432 미개방 |

### 6.2 맥미니에서 준비할 것

Postgres 설치·기동은 이미 끝났다. Homebrew `postgresql@18` 이 `brew services` 로 떠 있고
`listen_addresses=localhost,192.168.0.5`, `pg_hba` 는 `192.168.0.0/24` + `scram-sha-256`
만 허용한다. 2026-08-19 에 아래를 만들었다.

```text
DB     designgenerator
역할   designgenerator_app   (LOGIN, 앱 전용. superuser 아님)
백업   mae_backup            (CONNECT + public SELECT)
LAN    192.168.0.5:5432      sslmode=disable (집 안 평문, 터널 안에서는 disable)
시크릿 Secrets/env/mae/macdb/designgenerator.env
```

다시 만들 때는 `backend/scripts/provision_macmini_postgres.py` 를 맥미니에서 돌린다
(멱등: 이미 있으면 `EXISTS` 로 끝). 비밀번호는 stdout 에 내지 않고 시크릿 파일로만 옮긴다.

### 6.3 Cloud Run 에서 맥미니에 닿는 경로

맥미니는 대개 가정·사무실 회선 뒤에 있어 고정 주소가 없다. 세 가지 중 하나를 고른다.

| 방식 | 특징 | 적합 |
|---|---|---|
| **Cloudflare Tunnel** (권장) | 포트 개방 불필요, 공유기 설정 없음, 고정 호스트명 | 회선·IP 가 바뀌는 환경 |
| Tailscale | 사설망으로 묶어 평문도 안전, 설정 간단 | Cloud Run 에서는 사이드카가 필요해 손이 더 간다 |
| 포트 포워딩 + DDNS | 추가 도구 없음 | 공인 IP 가 있고 방화벽을 직접 관리할 때 |

⚠ 어떤 방식이든 **Postgres 포트를 그대로 인터넷에 여는 선택은 피한다.** 인증 실패
시도가 곧바로 들어온다. 터널을 쓰면 포트를 열지 않고도 같은 결과를 얻는다.

운영은 **Cloudflare Tunnel + Cloud Run sidecar** 를 쓴다. 맥미니 origin 은
`cloudflared` 가 localhost:5432 만 받고, Cloud Run 앱은 `DATABASE_URL` 호스트를
`127.0.0.1` 로 둔다. LAN 주소는 Cloud Run 에 넣지 않는다. sidecar 의
`access tcp --url` 은 `0.0.0.0:5432` 로 연다. `127.0.0.1` 만 열면 Cloud Run
startupProbe 가 컨테이너 IP 로 붙어 실패한다. 재적용은
`backend/scripts/deploy_cloudrun_pg_sidecar.py` 다.

### 6.4 전환 절차

```powershell
# 1) 먼저 연결만 확인한다 (스키마를 건드리지 않는다)
cd backend
$env:CHECK_DATABASE_URL = "postgresql://designgenerator_app:<pw>@192.168.0.5:5432/designgenerator?sslmode=disable"
.venv\Scripts\python.exe scripts\check_db.py
```

`check_db.py` 는 연결·인증·TLS·왕복 지연·인코딩·시간대·생성 권한·기존 테이블 수를
따로 확인한다. 한 번에 "연결 실패" 만 보면 원인을 좁히는 데 시간이 다 간다.

```powershell
# 2) 같은 문자열로 전체 스모크를 돌려 본다
#    ⚠ 대상 DB 의 스키마를 지우고 다시 만든다. 반드시 빈 DB 에만 쓴다.
$env:SMOKE_DATABASE_URL = $env:CHECK_DATABASE_URL
# 대상이 빈 DB 일 때만. 이미 시드된 designgenerator 에는 돌리지 않는다.
.venv\Scripts\python.exe scripts\smoke_e2e.py
```

```bash
# 3) 통과하면 Cloud Run 에 sidecar 를 붙인다. LAN 주소는 넣지 않는다.
#    앱 DATABASE_URL 호스트는 127.0.0.1 이다. 터널 호스트는 sidecar args 에만 둔다.
py -3 backend/scripts/deploy_cloudrun_pg_sidecar.py
```

스키마·플랜·템플릿은 `SEED_ON_STARTUP=true` 가 기동 시 채운다 (멱등).
운영에서도 데모 계정은 시연용으로 채운다. 공개 관리자 계정은 만들지 않는다.
문자열 PK 잔존 스키마는 **SQLite 에서만** 비운다. Postgres 는 Alembic 을 쓰고,
기동 중 `DROP CASCADE` 는 하지 않는다.

### 6.5 연결 문자열에서 걸리는 것

콘솔이나 문서가 주는 문자열은 `postgresql://user:pw@host/db?sslmode=require` 형태다.
그대로 넣으면 ① 드라이버 지정이 없어 동기 psycopg 를 찾다가 죽고 ② asyncpg 가
`sslmode` 를 모른다며 죽는다. `core/database.py` 의 `normalize_database_url()` 이
둘 다 흡수한다.

⚠ **`sslmode` 의 의미를 바꾸지 않는다.** libpq 에서 `require` 는 *암호화하되 인증서를
검증하지 않는다* 는 뜻이다. 이걸 '검증함'으로 해석하면 공개 CA 를 쓰는 관리형
서비스에서는 우연히 통과하지만, **자체 서명 인증서를 쓰는 맥미니에서는 연결이
끊긴다.** 모드 문자열을 그대로 넘겨 libpq 와 같게 동작시킨다.

| 상황 | 지정 |
|---|---|
| 자체 서명 인증서 | `?sslmode=require` (암호화만) |
| 사설 CA 로 서명 | `?sslmode=verify-ca&sslrootcert=/경로/ca.pem` |
| 공개 CA (관리형) | `?sslmode=verify-full` |
| 터널 내부라 이미 암호화됨 | `?sslmode=disable` |

`sslrootcert` 파일이 컨테이너 안에 없으면 **기동을 막고 경로를 알려 준다** — SSL
내부 오류로 터지면 원인이 보이지 않는다.

### 6.6 맥미니를 쓸 때 같이 볼 것

. **지연** — Cloud Run(서울)과 맥미니 사이 왕복이 그대로 응답 시간에 더해진다.
  `check_db.py` 가 평균·최대를 재 주며, 50ms 를 넘으면 경고한다
. **가용성** — 맥미니가 꺼지거나 회선이 끊기면 서비스가 함께 멈춘다. 절전 방지와
  재부팅 후 자동 기동(`brew services`)을 반드시 켠다
. **백업** — 자체 호스팅은 백업도 자체 책임이다. `pg_dump` 주기 실행 + 외부 보관
. **인스턴스 상한** — SQLite 때문에 걸어 둔 `--max-instances 1` 은 Postgres 전환 후
  올릴 수 있다. 다만 레이트 리밋이 프로세스 메모리 기반이라(§3.5) 같이 손봐야 한다

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|---|---|---|---|
| v1.1.8 | 2026-08-22 | 안승준 | 시안 캔버스 카피 i18n 전환(하드코딩 영문 제거). 429 응답을 서버 문구 그대로 살려 전달 |
| v1.1.7 | 2026-08-19 | 안승준 | 프론트 i18n ko/en 골격·화면 키 연동. 헤더 로케일 전환 |
| v1.1.6 | 2026-08-19 | 안승준 | 앱 재배포는 sidecar 유지 스크립트만 쓴다. `--source` 는 sidecar 를 지운다. 운영 리비전 `adg-api-00023-jbk` |
| v1.1.5 | 2026-08-19 | 안승준 | 허브 `designgenerator` `active` 전환·적재 확인. Cloud Run 실 Gemini 파이프라인은 이미 켜져 있음을 문서 반영 |
| v1.1.4 | 2026-08-19 | 안승준 | Cloud Run `adg-api-00022-zzz` sidecar 로 맥미니 Postgres 연결. 5432 미개방. §6.3·§6.4 반영 |
| v1.1.3 | 2026-08-19 | 안승준 | 운영 데모 계정 시드·로그인 허용. 공개 관리자만 잠금 |
| v1.1.2 | 2026-08-18 | 안승준 | §5 DA 스키마 행 — 코드 그룹 30종·Alembic `202608161400` 반영 (3~5차 누적) |
| v1.1.1 | 2026-08-16 | 안승준 | Postgres 기동 시 스키마 wipe 금지. Cloudflare IP 헤더는 신뢰하지 않는다 |
| v1.1.0 | 2026-08-16 | 안승준 | §5 현재 상태 일자·DA 스키마·쿠키/CSRF/봇 반영. 운영 시드 계정 잠금 정정. 변경이력 신설 |
| v1.0.0 | 2026-08-14 | 안승준 | 초판. Hosting + Cloud Run 배포 절차 |
