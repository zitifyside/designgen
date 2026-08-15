"""비동기 SQLAlchemy 엔진 + 세션 팩토리.

기본값은 SQLite이며, DATABASE_URL을 postgresql+asyncpg://... URL로 설정하면 전환됩니다.
"""
from __future__ import annotations

import logging
import ssl
from collections.abc import AsyncGenerator
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger("adg")

# asyncpg 가 이해하지 못해 연결 자체를 실패시키는 libpq 전용 쿼리 파라미터.
# 관리형 Postgres 콘솔이 주는 문자열에 기본으로 붙어 있다.
_LIBPQ_ONLY_PARAMS = {
    "sslmode",
    "sslrootcert",
    "channel_binding",
    "options",
    "target_session_attrs",
}

# asyncpg 가 그대로 받는 libpq 의 SSL 모드. 의미를 바꾸지 않고 넘긴다.
_SSL_MODES = {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}


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
    root_cert = dropped.get("sslrootcert", "")

    if root_cert:
        # 사설 CA 로 서명한 인증서(자체 호스팅 DB)는 그 CA 를 신뢰 목록에 넣어야
        # 검증이 통과한다. 이 경우에만 컨텍스트를 직접 만든다.
        if not Path(root_cert).is_file():
            # 여기서 막지 않으면 기동 중에 SSL 내부 오류로 터져 원인이 안 보인다.
            raise RuntimeError(
                f"sslrootcert 경로에 파일이 없습니다: {root_cert}. "
                "CA 인증서를 컨테이너 안에서 읽을 수 있는 경로에 두세요."
            )
        ctx = ssl.create_default_context(cafile=root_cert)
        if sslmode not in {"verify-full"}:
            # verify-ca 는 CA 만 확인하고 호스트명은 보지 않는다 (libpq 정의).
            ctx.check_hostname = False
        connect_args["ssl"] = ctx
    elif sslmode in _SSL_MODES:
        # 모드 문자열을 그대로 넘긴다. `True` 로 바꾸면 **`require` 까지 인증서를
        # 검증**하게 되어, libpq 라면 붙었을 자체 서명 인증서에서 연결이 끊긴다
        # (libpq 의 require 는 '암호화하되 검증하지 않음'이다).
        connect_args["ssl"] = sslmode

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


def _add_missing_columns(conn) -> list[str]:
    """모델에는 있는데 실제 테이블에는 없는 컬럼을 채운다.

    `create_all` 은 **없는 테이블만 만들고 기존 테이블은 손대지 않는다.** 그래서
    모델에 컬럼을 하나 추가하면 새 DB 에서는 멀쩡하고 기존 DB 에서만
    `no such column` 으로 터진다 — 개발 중에는 파일을 지우면 그만이지만 운영
    DB 에서는 그럴 수 없다.

    여기서는 **추가만** 한다. 이름 변경·타입 변경·삭제는 데이터 해석이 필요하고
    자동으로 판단할 수 없으므로 손대지 않는다. 그 수준이 필요해지면 Alembic 을
    도입할 시점이다.
    """
    from sqlalchemy import inspect, text
    from sqlalchemy.schema import CreateColumn

    dialect = conn.dialect
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())
    added: list[str] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all 이 방금 만들었으므로 최신이다
        present = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in present:
                continue
            # 기존 행에 채울 값이 없으므로 NULL 을 허용하는 컬럼만 안전하게 붙인다.
            if not column.nullable and column.default is None and column.server_default is None:
                logger.warning(
                    "컬럼 %s.%s 는 자동 추가할 수 없다 (NOT NULL·기본값 없음). "
                    "수동 마이그레이션이 필요하다.",
                    table.name,
                    column.name,
                )
                continue
            spec = CreateColumn(column).compile(dialect=dialect)
            conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {spec}'))
            added.append(f"{table.name}.{column.name}")
    return added


async def init_db() -> None:
    """테이블을 만들고, 기존 테이블에 빠진 컬럼을 채운다.

    이름 변경·타입 변경처럼 데이터 해석이 필요한 변경은 다루지 않는다 —
    그 단계에서는 Alembic 을 붙인다.
    """
    # create_all 이전에 Base.metadata에 등록되도록 모델을 import합니다.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        added = await conn.run_sync(_add_missing_columns)
    if added:
        logger.info("스키마 보정 — 컬럼 추가: %s", ", ".join(added))
