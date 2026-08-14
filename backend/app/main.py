"""FastAPI 애플리케이션 진입점."""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.database import init_db
from app.core.observability import (
    configure_logging,
    log_event,
    logger,
    trace_id_var,
    user_id_var,
)
from app.core.security_middleware import (
    SECURITY_HEADERS,
    enforce_request_limits,
    verify_production_secrets,
)
from app.services import loghub

# 요청 경로 중 접근 로그를 남기지 않을 것 (헬스 체크가 로그를 뒤덮지 않게 한다).
QUIET_PATHS = {"/", "/docs", "/openapi.json", "/redoc", f"{settings.api_v1_prefix}/health"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    verify_production_secrets()

    # 로컬/SQLite 개발 환경에서는 부팅 시 테이블을 생성합니다. 프로덕션에서는
    # 대신 Alembic 마이그레이션을 실행하고 이 호출을 제거하거나 가드 처리하세요.
    if settings.database_url.startswith("sqlite"):
        await init_db()
    if settings.seed_on_startup:
        # 컨테이너는 매번 빈 파일시스템으로 뜨므로 플랜·데모 계정을 채운다 (멱등).
        from app.seed import seed

        await seed()

    loghub.start_forwarder()
    logger.info(
        "service_started",
        extra={"event": {"kind": "service.started",
                         "version": settings.service_version,
                         "environment": settings.environment}},
    )
    try:
        yield
    finally:
        await loghub.stop_forwarder()


app = FastAPI(
    title=settings.app_name,
    version=settings.service_version,
    lifespan=lifespan,
    # 운영에서는 API 스키마를 공개하지 않는다 (공격면 축소).
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """요청마다 상관관계 ID 를 부여하고 접근 로그를 남긴다.

    Cloud Run·프록시가 넘겨준 추적 헤더가 있으면 이어 붙여, 프론트 → 허브까지
    같은 trace_id 로 따라갈 수 있게 한다.
    """
    incoming = (
        request.headers.get("x-request-id")
        or request.headers.get("x-cloud-trace-context", "").split("/")[0]
    )
    trace_id = (incoming or uuid.uuid4().hex)[:64]
    trace_token = trace_id_var.set(trace_id)
    user_token = user_id_var.set(None)
    started = time.perf_counter()

    limit_response = enforce_request_limits(request)
    if limit_response is not None:
        trace_id_var.reset(trace_token)
        user_id_var.reset(user_token)
        return limit_response

    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["x-request-id"] = trace_id
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response
    except Exception as exc:  # noqa: BLE001 — 미처리 예외도 관측하고 표준 응답으로 바꾼다
        import traceback

        log_event(
            kind="http.unhandled_error",
            level="error",
            message=f"{type(exc).__name__}: {exc}"[:4000],
            stack=traceback.format_exc(),
            trace_id=trace_id,
            method=request.method,
            path=request.url.path,
            status_code=500,
            duration_ms=int((time.perf_counter() - started) * 1000),
            ip=_client_ip(request),
        )
        # 내부 예외 내용을 클라이언트에 노출하지 않는다.
        return JSONResponse(
            status_code=500,
            content={"detail": "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."},
            headers={"x-request-id": trace_id, **SECURITY_HEADERS},
        )
    finally:
        duration_ms = int((time.perf_counter() - started) * 1000)
        path = request.url.path
        if path not in QUIET_PATHS and status_code != 500:
            level = "warn" if status_code >= 400 else "info"
            log_event(
                kind="http.request",
                level=level,
                message=f"{request.method} {path} {status_code}",
                trace_id=trace_id,
                user_id=user_id_var.get(),
                method=request.method,
                path=path,
                status_code=status_code,
                duration_ms=duration_ms,
                ip=_client_ip(request),
            )
        trace_id_var.reset(trace_token)
        user_id_var.reset(user_token)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["system"])
async def root():
    return {
        "name": settings.app_name,
        "version": settings.service_version,
        "api": settings.api_v1_prefix,
    }
