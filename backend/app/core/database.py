"""비동기 SQLAlchemy 엔진 + 세션 팩토리.

기본값은 SQLite이며, DATABASE_URL을 postgresql+asyncpg://... URL로 설정하면 전환됩니다.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# asyncpg 가 이해하지 못해 연결 자체를 실패시키는 libpq 전용 쿼리 파라미터.
# Neon·Supabase 가 콘솔에서 주는 문자열에 기본으로 붙어 있다.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "options", "target_session_attrs"}


def normalize_database_url(url: str) -> tuple[str, dict]:
    """운영 DB 문자열을 asyncpg 가 받아들이는 형태로 다듬는다.

    관리형 Postgres 콘솔은 `postgresql://user:pw@host/db?sslmode=require` 를 준다.
    이걸 그대로 넣으면 ① 드라이버가 없어 동기 psycopg 를 찾다가 죽고
    ② `sslmode` 를 asyncpg 가 모른다며 죽는다. 붙여넣기 한 번으로 배포가
    막히는 자리라 코드에서 흡수한다 — SSL 요구는 파라미터를 버리는 게 아니라
    connect_args 의 `ssl` 로 옮겨 **그대로 유지**한다.
    """
    if url.startswith("sqlite"):
        return url, {"check_same_thread": False}

    # 1) 드라이버 지정이 없으면 asyncpg 로 채운다.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]

    if "+asyncpg" not in url:
        return url, {}

    # 2) libpq 전용 파라미터를 걷어내고 SSL 요구만 connect_args 로 옮긴다.
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    kept = [(k, v) for k, v in query if k.lower() not in _LIBPQ_ONLY_PARAMS]
    dropped = {k.lower(): v for k, v in query if k.lower() in _LIBPQ_ONLY_PARAMS}

    connect_args: dict = {}
    sslmode = dropped.get("sslmode", "").lower()
    if sslmode in {"require", "verify-ca", "verify-full", "prefer"}:
        connect_args["ssl"] = True

    cleaned = urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment)
    )
    return cleaned, connect_args


_database_url, _connect_args = normalize_database_url(settings.database_url)
_is_sqlite = _database_url.startswith("sqlite")

engine = create_async_engine(
    _database_url,
    echo=settings.debug and settings.environment == "development",
    future=True,
    connect_args=_connect_args,
    # 관리형 Postgres 는 유휴 연결을 서버 쪽에서 끊는다. Cloud Run 컨테이너가
    # 오래 놀다가 요청을 받으면 죽은 연결을 집어 첫 요청만 실패하므로,
    # 꺼내 쓰기 전에 살아 있는지 확인하고 오래된 연결은 주기적으로 교체한다.
    **(
        {}
        if _is_sqlite
        else {"pool_pre_ping": True, "pool_recycle": 300, "pool_size": 5, "max_overflow": 5}
    ),
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
