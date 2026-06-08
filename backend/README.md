# AI Design Generator — 백엔드 (FastAPI)

AI Design Generator의 FastAPI 백엔드입니다. 기본은 SQLite(별도 설치 불필요),
`DATABASE_URL`만 바꾸면 PostgreSQL로 전환됩니다. 비동기 SQLAlchemy 2.0 + Alembic 기반.

> **의도적으로 비워둔 부분** (요청 범위):
> - **AI 프롬프트 / 모델 호출** — [`app/services/ai/`](app/services/ai/)의 Gemini·Codex
>   프로바이더는 연결만 돼 있고 프롬프트와 요청 본문은 전부 비어 있습니다
>   (`raise NotImplementedError`). `FAKE_AI_PIPELINE` 모드가 placeholder
>   디자인 시스템 + 목업을 생성하므로, 키 없이도 앱이 끝까지 동작합니다.
> - **결제** — [`app/api/routes/billing.py`](app/api/routes/billing.py)의 Stripe
>   결제·크레딧 구매·환불·웹훅은 `501`을 반환합니다. 결제용 DB 모델은 이미
>   만들어져 있습니다.

## 빠른 시작

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # SECRET_KEY 수정 (키는 나중에)
python -m app.seed            # 테이블 생성 + 데모/관리자 계정 + 플랜 시드
uvicorn app.main:app --reload --port 8000
```

- API 문서 (Swagger): http://localhost:8000/docs
- 기본 URL: `http://localhost:8000/api/v1`
- 시드 계정: `demo@designgenerator.io / demo1234`, `admin@designgenerator.io / admin1234`

## 프로젝트 구조

```
app/
  core/        설정, 데이터베이스(비동기 엔진), 보안(JWT/bcrypt), 의존성
  models/      SQLAlchemy 모델 (users, projects, design, generation, billing, …)
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

`InputAnalyzer → ConceptEngine → LayoutEngine → Renderer`

`GET /api/v1/generations/{id}/status`로 `stage`/`progress`를 폴링합니다.
성공하면 프로젝트의 디자인 시스템 + 목업이 채워지고 알림이 발송됩니다.

- **`FAKE_AI_PIPELINE=true`** (기본): 프론트의 mock 컨셉을 그대로 따르는
  결정적(deterministic) placeholder 출력. API 키가 필요 없습니다.
- **`FAKE_AI_PIPELINE=false`**: 실제 프로바이더를 호출합니다. `gemini.py` /
  `codex.py`의 프롬프트를 구현하기 전까지는 명확한 메시지와 함께 생성이 실패합니다.

### AI 프로바이더 구현하기

[`app/services/ai/gemini.py`](app/services/ai/gemini.py) /
[`codex.py`](app/services/ai/codex.py)를 열어 다음을 채우세요:
1. `PROMPT_*` 문자열 (단계별 하나씩).
2. `_complete()` 메서드 (요청 구성 + JSON 파싱).
이후 4개 단계 메서드가 `_complete(...)`를 호출합니다. 각 단계의 입출력 규격은
[`app/services/ai/base.py`](app/services/ai/base.py)에 문서화돼 있습니다.

## PostgreSQL로 전환하기

1. `pip install asyncpg` (`requirements.txt`에서 주석 해제).
2. `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/designgen` 설정.
3. SQLite 자동 생성 대신 Alembic 사용:
   ```bash
   alembic revision --autogenerate -m "init"
   alembic upgrade head
   ```

## 운영(production) 참고 사항

- 파이프라인을 `BackgroundTasks`에서 실제 큐(Redis/arq/Celery)로 옮기고
  재시도 + 우선순위 큐(Pro/Team > Free)를 적용하세요.
- 레이트 리밋 추가 (서비스 정책: 비로그인 20/분, 사용자 60/분, API 키 300/600).
- `ai_cost_cents` 기록, 월간 초기화 작업 실행, Stripe + 웹훅 연동.
```
