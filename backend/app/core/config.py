"""환경 변수 / .env 파일에서 로드하는 애플리케이션 설정."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# uvicorn 작업 디렉터리와 무관하게 backend/.env 를 읽는다.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.is_file() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 앱
    app_name: str = "AI Design Generator API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    # NoDecode: pydantic-settings가 환경 변수 값을 JSON으로 파싱하지 않도록 합니다.
    # 아래 validator가 쉼표로 구분된 문자열을 직접 분리합니다.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    # 관리자 API(/admin) 허용 IP·CIDR. 비우면 막지 않는다 (환경변수 누락 잠금 방지).
    admin_allow_ips: Annotated[list[str], NoDecode] = []

    # 데이터베이스
    database_url: str = "sqlite+aiosqlite:///./designgen.db"
    # 기동 시 플랜·데모 계정을 시드한다 (멱등). 컨테이너처럼 매번 새 파일시스템에서
    # 뜨는 환경에서 켠다 — 로컬은 `python -m app.seed` 를 직접 부르므로 기본값 False.
    seed_on_startup: bool = False

    # 인증 / JWT
    secret_key: str = "change-me-please-use-a-long-random-string"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    jwt_algorithm: str = "HS256"

    # AI 파이프라인. 기본은 실제 생성. 스모크·결정론 검증만 true.
    fake_ai_pipeline: bool = False
    # mae = 마에 제공 CLI 사다리(antigravity→codex→claude)
    # gemini = Gemini API (Cloud Run 폴백) · codex / antigravity / claude 단독
    ai_provider: str = "mae"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    # 시안 안 이미지 슬롯 생성. 끄면 슬롯이 그라디언트로 채워지고 시안 자체는
    # 그대로 나온다 — 이미지는 시안의 장식이지 본체가 아니다.
    mockup_images_enabled: bool = True
    gemini_image_model: str = "gemini-3-pro-image"
    # 이미지 모델 풀. 쉼표로 나열하면 슬롯을 모델별로 나눠 굽는다 — 한 모델이
    # 전부 그리면 시안 안 사진의 화풍이 한 벌로 굳고, 그 모델이 막히면 전멸한다.
    # 비우면 gemini_image_model 하나만 쓴다.
    image_model_pool: str = ""
    # 모델 하나가 연속으로 맡는 장수(1~2 권장). 이 수만큼 굽고 다음 모델로 넘어간다.
    image_slots_per_model: int = 1
    # 이미지를 어느 채널로 만들지. relay|gemini, 비우면 ai_provider 를 따라간다.
    # 한쪽만 다른 곳을 보면 "생성은 되는데 그림만 안 나오는" 상태가 된다.
    image_channel: str = ""
    # Stage 4 는 완성 페이지 HTML 한 벌을 한 응답에 담는다. 출력 상한이 작은
    # 모델(예: gemini-2.0-flash = 8,192)에서는 마크업이 중간에 잘려 JSON 이
    # 깨지고, 그 실패가 "렌더 3회 실패 → 컨셉 보드" 로만 보여 원인을 못 찾는다.
    # 그래서 렌더 단계만 모델·출력 상한을 따로 준다. 비우면 gemini_model 을 쓴다.
    gemini_render_model: str = ""
    gemini_render_max_output_tokens: int = 32768
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    codex_cli: str = ""
    codex_model: str = "gpt-5.6-terra"
    codex_timeout_seconds: int = 180
    codex_render_timeout_seconds: int = 900
    mae_ladder: str = "antigravity,codex,claude"
    antigravity_model: str = "gemini-3.7-flash-medium"
    claude_cli_model: str = "sonnet"
    mae_cli_timeout_seconds: int = 180
    # Stage 4 는 페이지 한 벌을 쓰느라 앞 단계보다 한 자릿수 오래 걸린다.
    # 같은 180초를 쓰면 매번 끊겨 사다리 3채널을 다 태우고도 실패한다.
    mae_cli_render_timeout_seconds: int = 900
    # 릴레이 — 운영 컨테이너가 운영자 PC 의 구독 CLI 사다리를 부르는 경로.
    # relay_timeout_seconds 는 Stage 4 한 장을 기다리는 시간이다. 짧게 잡으면
    # 진행 중인 렌더를 끊고 Fallback 으로 떨어뜨린다.
    relay_url: str = ""
    relay_token: str = ""
    relay_timeout_seconds: int = 3000
    # 잡 상태를 물어보는 간격. 짧으면 요청이 늘고, 길면 끝난 작업을 놀려 둔다.
    relay_poll_seconds: int = 5

    # 결제 (Stripe) — 스텁 처리됨
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # 관측 (로깅 + 중앙 로그 허브)
    service_name: str = "adg-api"
    service_version: str = "0.2.0"
    log_level: str = "INFO"
    # 로컬 DB 로그 보존 일수. 0 이면 정리하지 않는다.
    log_retention_days: int = 14
    # 중앙 로그 허브 (마에 loghub). 값은 Secrets/env/designgenerator/loghub.env 에 있다.
    mae_loghub_url: str = ""
    mae_loghub_key: str = ""
    mae_loghub_project_id: str = "designgenerator"
    mae_loghub_env: str = ""  # 미지정 시 environment 를 따른다
    # off = 전송 안 함 / dual = DB + 허브 / local = DB 만
    log_sink_mode: str = "dual"

    @property
    def allowed_hosts(self) -> list[str]:
        """CORS 출처에서 호스트만 뽑은 TrustedHost 허용 목록.

        Cloud Run 은 자체 도메인(*.run.app)으로도 요청을 받으므로 함께 허용한다.
        """
        hosts: list[str] = []
        for origin in self.cors_origins:
            host = origin.split("://")[-1].split("/")[0]
            if host and host not in hosts:
                hosts.append(host)
        hosts.append("*.run.app")
        return hosts

    @property
    def loghub_environment(self) -> str:
        """허브가 받는 environment 는 production·staging·local 세 값뿐이다."""
        value = (self.mae_loghub_env or self.environment).strip().lower()
        if value in ("production", "staging", "local"):
            return value
        # development·test 등 내부 명칭은 허브 계약상 local 로 접는다.
        return "local"

    @field_validator("cors_origins", "admin_allow_ips", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
