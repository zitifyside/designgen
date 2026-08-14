"""FastAPI 애플리케이션 진입점."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 로컬/SQLite 개발 환경에서는 부팅 시 테이블을 생성합니다. 프로덕션에서는
    # 대신 Alembic 마이그레이션을 실행하고 이 호출을 제거하거나 가드 처리하세요.
    if settings.database_url.startswith("sqlite"):
        await init_db()
    if settings.seed_on_startup:
        # 컨테이너는 매번 빈 파일시스템으로 뜨므로 플랜·데모 계정을 채운다 (멱등).
        from app.seed import seed

        await seed()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["system"])
async def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "api": settings.api_v1_prefix,
    }
