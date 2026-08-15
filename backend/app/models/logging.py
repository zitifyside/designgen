"""애플리케이션 로그 이벤트 (로컬 적재분)."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, pk_column, public_id_column

LOG_LEVELS = ("debug", "info", "warn", "error", "fatal")
TIER_TELEMETRY = "t1"
TIER_ERROR = "t2"
TIER_AUDIT = "t3"


class AppLogEvent(Base, TimestampMixin):
    __tablename__ = "log_app_event"

    pk: Mapped[int] = pk_column("log_id")
    id: Mapped[str] = public_id_column("log")
    event_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    level: Mapped[str] = mapped_column("level_cd", String(10), index=True)
    tier: Mapped[str] = mapped_column("tier_cd", String(2), default=TIER_TELEMETRY)
    kind: Mapped[str] = mapped_column("kind_cd", String(80), index=True)
    message: Mapped[str | None] = mapped_column(
        "message_desc", String(4000), nullable=True
    )
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column("source_nm", String(80), nullable=True)
    method: Mapped[str | None] = mapped_column("method_cd", String(10), nullable=True)
    path: Mapped[str | None] = mapped_column("path_nm", String(255), nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload: Mapped[dict | None] = mapped_column("payload_json", JSON, nullable=True)
    stack: Mapped[str | None] = mapped_column("stack_desc", Text, nullable=True)
    forward_state: Mapped[str] = mapped_column(
        "forward_state_cd", String(10), default="pending", index=True
    )


Index("ix_log_app_event_level_time", AppLogEvent.level, AppLogEvent.occurred_at)
Index("ix_log_app_event_kind_time", AppLogEvent.kind, AppLogEvent.occurred_at)
