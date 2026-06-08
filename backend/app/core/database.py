"""비동기 SQLAlchemy 엔진 + 세션 팩토리.

기본값은 SQLite이며, DATABASE_URL을 postgresql+asyncpg://... URL로 설정하면 전환됩니다.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug and settings.environment == "development",
    future=True,
    # check_same_thread는 SQLite 전용 플래그이며, 범위를 한정해도 무해합니다.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


class Base(DeclarativeBase):
    """모든 ORM 모델의 Declarative base."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """트랜잭션 세션을 yield하는 FastAPI 의존성."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """최초 실행 / SQLite 개발용으로 테이블을 생성합니다. 실제 마이그레이션에는 Alembic을 사용하세요."""
    # create_all 이전에 Base.metadata에 등록되도록 모델을 import합니다.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
