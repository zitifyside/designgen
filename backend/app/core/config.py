"""환경 변수 / .env 파일에서 로드하는 애플리케이션 설정."""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # 앱
    app_name: str = "AI Design Generator API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    # NoDecode: pydantic-settings가 환경 변수 값을 JSON으로 파싱하지 않도록 합니다.
    # 아래 validator가 쉼표로 구분된 문자열을 직접 분리합니다.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

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

    # AI 파이프라인
    fake_ai_pipeline: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
