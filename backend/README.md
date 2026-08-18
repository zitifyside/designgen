# AI Design Generator — 백엔드 (FastAPI)

AI Design Generator의 FastAPI 백엔드입니다. 기본은 SQLite(별도 설치 불필요),
`DATABASE_URL`만 바꾸면 PostgreSQL로 전환됩니다. 비동기 SQLAlchemy 2.0 + Alembic 기반.

> **아직 비어 있는 부분**:
> - **실 AI 호출** — [`app/services/ai/`](app/services/ai/)의 Gemini·Codex 프로바이더는
>   프롬프트·구조화 출력 스키마까지 작성돼 있지만, 기본값은 `FAKE_AI_PIPELINE=true`
>   (결정론적 placeholder)입니다. 실호출은 키를 넣고 `false` 로 바꿔야 켜집니다.
> - **결제** — [`app/api/routes/billing.py`](app/api/routes/billing.py)의 Stripe
>   결제·크레딧 구매·환불·웹훅은 `501`을 반환합니다. 결제용 DB 모델은 이미
>   만들어져 있습니다.

## 로컬 환경 (Windows · 권장)

제어 스크립트 하나로 준비·기동·정지·검증을 모두 처리합니다. 서버는 **콘솔 창 없이**
백그라운드로 뜨고 로그는 `backend/logs/` 로 떨어집니다.

```powershell
cd D:\Project\designgenerator\backend

# 최초 1회 — 가상환경 + 의존성 + .env 확인 + DB 시드
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 setup

# 기동 / 정지 / 재기동 / 상태
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 start
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 stop
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 restart
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 status
```

| Action | 설명 |
|---|---|
| `setup` | 가상환경 생성 → 의존성 설치 → `.env` 확인 → DB 시드 |
| `start` | 숨김 실행 기동. `-Port 8010` 로 포트 변경, `-Reload` 로 자동 리로드 |
| `stop` | 프로세스 트리 정리 후 포트 해제까지 확인 |
| `status` | 기동 여부 + 공개 `/health` (`{"status":"ok"}`). 환경·DB·FAKE_AI 는 `/admin/health` |
| `logs` | 최근 로그 (`-Lines 100`) |
| `seed` | 플랜·계정 시드 (멱등) |
| `reset` | ⚠ DB 삭제 후 재시드 — 로컬 데이터가 사라집니다 |
| `smoke` | 문서 규칙 E2E (`scripts/smoke_e2e.py`, 임시 DB 격리, 서버 불필요) |

### 수동 실행 (macOS·Linux 또는 스크립트 없이)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # SECRET_KEY 수정
python -m app.seed            # 테이블 생성 + 데모/관리자 계정 + 플랜 시드
uvicorn app.main:app --reload --port 8000
```

### 접속 정보

- API 문서 (Swagger): http://localhost:8000/docs
- 기본 URL: `http://localhost:8000/api/v1` · 헬스: `/api/v1/health`
- 시드 계정: `demo@designgenerator.io / demo1234` (Pro), `admin@designgenerator.io / admin1234` (Admin)

### 환경 변수 (`.env`)

시크릿은 ContextBuilder `Secrets/env/designgenerator/backend/.env` 를 심볼릭 링크로
참조합니다. 값 수정은 링크 원본에서 하고, 저장소에는 커밋하지 않습니다.

| 키 | 로컬 기본값 | 비고 |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./designgen.db` | Postgres 전환 시 `postgresql+asyncpg://…` |
| `CORS_ORIGINS` | `localhost:3000~3002` | 프론트가 다른 포트로 뜨면 여기에 추가 |
| `FAKE_AI_PIPELINE` | `true` | `false` + `AI_PROVIDER=codex` 면 로컬 Codex CLI 호출 |
| `DEBUG` | `true` | SQL 쿼리를 로그에 찍습니다. 조용히 하려면 `false` |
| `SECRET_KEY` | 개발용 플레이스홀더 | 배포 전 반드시 교체 |

### 프론트와 함께 띄우기

```powershell
# 1) 백엔드
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 start

# 2) 프론트 (별도 창)
cd ..\frontend; npm run dev
```

프론트 개발 서버는 `http://localhost:8000/api/v1` 을 기본 API 주소로 씁니다
(`frontend/next.config.mjs`). 3000 번이 점유돼 다른 포트로 뜨면 `CORS_ORIGINS` 에
그 포트를 추가하고 백엔드를 재기동합니다.

### 정합 점검

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-server.ps1 smoke   # E2E 스모크
.venv\Scripts\python.exe scripts\check_api_paths.py                     # 프론트 호출 경로 ↔ 라우트 대조
```

## 프로젝트 구조

```
app/
  core/        설정, 데이터베이스(비동기 엔진), 보안(JWT/bcrypt), 의존성
  models/      SQLAlchemy 모델 (mst_user, trx_project, trx_design_system, …)
  schemas/     Pydantic v2 스키마 (Next.js 프론트에 맞춘 camelCase 출력)
  services/
    ai/        프로바이더 인터페이스 + Gemini/Codex 스텁 + 파이프라인 + placeholder
    quota.py   플랜별 한도 + 크레딧 차감
  api/routes/  auth, users, projects, generations, design_systems, mockups,
               templates, notifications, billing, admin, system
  main.py      앱 팩토리 + CORS + 라우터 등록
  seed.py      플랜 / 데모 계정 / 템플릿 시드
alembic/       비동기 마이그레이션
```

## 생성 파이프라인

`POST /api/v1/projects/{id}/generate`는 쿼터를 차감하고 `Generation` 레코드를
만든 뒤, 4단계 파이프라인을 백그라운드 작업으로 실행합니다.

`InputAnalyzer → ConceptEngine → LayoutEngine → Renderer` (4단계. 화면 추가는 Layout→Renderer)

`GET /api/v1/generations/{id}/status`로 `stage`/`progress`를 폴링합니다.
성공하면 프로젝트의 디자인 시스템 + 목업이 채워지고 알림이 발송됩니다.

- **`FAKE_AI_PIPELINE=true`** (기본): 프론트의 mock 컨셉을 그대로 따르는
  결정적(deterministic) placeholder 출력. API 키가 필요 없습니다.
- **`FAKE_AI_PIPELINE=false`**: `AI_PROVIDER=codex`(기본) 이면 로컬
  `codex exec` (`gpt-5.6-terra`) 를 호출한다. ChatGPT 로그인이 이 머신에
  있어야 한다. Cloud Run 컨테이너에는 CLI 가 없으므로 운영은 placeholder 를 유지한다.

### AI 프로바이더 구현하기

[`app/services/ai/gemini.py`](app/services/ai/gemini.py) /
[`codex.py`](app/services/ai/codex.py)를 열어 다음을 채우세요:
1. `PROMPT_*` 문자열 (단계별 하나씩).
2. `_complete()` 메서드 (요청 구성 + JSON 파싱).
이후 4개 단계 메서드가 `_complete(...)`를 호출합니다. 각 단계의 입출력 규격은
[`app/services/ai/base.py`](app/services/ai/base.py)에 문서화돼 있습니다.

## PostgreSQL로 전환하기

1. `asyncpg` 는 `requirements.txt` 에 이미 있다.
2. `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/designgen` (또는 `postgresql://…?sslmode=require` — `normalize_database_url` 이 흡수한다).
3. 기동 시 `init_db` 가 테이블·빠진 컬럼·활성 뷰를 채운다. 버전 기록은 Alembic
   `202608161200`·`202608161400` (ADD) / `U202608161200`·`U202608161400` (DROP 롤백) 이다.
   ```bash
   alembic upgrade head
   ```

## 운영(production) 참고 사항

- 파이프라인을 `BackgroundTasks`에서 실제 큐(Redis/arq/Celery)로 옮기고
  재시도 + 우선순위 큐(Pro/Team > Free)를 적용하세요.
- 레이트 리밋은 프로세스 메모리로 이미 있다 (로그인·가입·업로드·API·Public API 등급별). 인스턴스를 늘리면 Redis 로 옮겨야 한다.
- `ai_cost_cents` 기록, 월간 초기화 작업 실행, Stripe + 웹훅 연동.
```
