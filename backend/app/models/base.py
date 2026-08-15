"""공용 모델 헬퍼: BIGINT PK · public_id · 감사 컬럼 5종."""
from __future__ import annotations

import datetime as dt
import secrets

from sqlalchemy import BigInteger, DateTime, Identity, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

SYSTEM_ACTOR_ID = "0"
ANON_ACTOR_ID = "-1"


def gen_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def _actor_id() -> str:
    try:
        from app.core.observability import user_id_var

        return user_id_var.get() or SYSTEM_ACTOR_ID
    except Exception:  # noqa: BLE001
        return SYSTEM_ACTOR_ID


def pk_column(db_name: str) -> Mapped[int]:
    """내부 BIGINT 자동채번 PK (PK_FK규칙 기본값)."""
    return mapped_column(
        db_name,
        BigInteger().with_variant(Integer, "sqlite"),
        Identity(),
        primary_key=True,
    )


def public_id_column(prefix: str) -> Mapped[str]:
    """외부 노출 식별자. JWT·URL·JSON 의 id."""
    return mapped_column(
        "public_id",
        String(40),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: gen_id(prefix),
    )


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AuditMixin(TimestampMixin):
    created_by: Mapped[str] = mapped_column(
        String(40), nullable=False, default=_actor_id, server_default=SYSTEM_ACTOR_ID
    )
    updated_by: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=_actor_id,
        onupdate=_actor_id,
        server_default=SYSTEM_ACTOR_ID,
    )
    deleted_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
