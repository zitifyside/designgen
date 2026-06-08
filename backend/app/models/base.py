"""공용 모델 헬퍼: 접두사 ID 및 타임스탬프 컬럼."""
from __future__ import annotations

import datetime as dt
import secrets

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column


def gen_id(prefix: str) -> str:
    """짧고 사람이 읽기 쉬운 접두사 ID, 예: 'p_a1b2c3d4'."""
    return f"{prefix}_{secrets.token_hex(5)}"


def id_column(prefix: str) -> Mapped[str]:
    return mapped_column(
        String(40), primary_key=True, default=lambda: gen_id(prefix)
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
