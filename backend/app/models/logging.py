"""애플리케이션 로그 이벤트 (로컬 적재분).

중앙 로그 허브(마에 loghub)가 권위 저장소이고, 이 테이블은 **운영 콘솔에서 바로
보기 위한 로컬 사본**이다. 허브가 죽어도 관측이 끊기지 않도록 두 곳에 쓴다.

허브 계약(Mae_중앙로그허브_구현명세 v1.0.0 §3.1)과 필드 이름을 맞춰 두었으므로
전송 어댑터가 형변환 없이 그대로 매핑한다.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 허브가 받는 다섯 등급 (그 외 값은 허브가 이벤트 단위로 거절한다).
LOG_LEVELS = ("debug", "info", "warn", "error", "fatal")

# t1 = 텔레메트리, t2 = 오류 관측, t3 = 감사 사본.
TIER_TELEMETRY = "t1"
TIER_ERROR = "t2"
TIER_AUDIT = "t3"


class AppLogEvent(Base, TimestampMixin):
    __tablename__ = "app_log_events"

    id: Mapped[str] = id_column("log")
    # 허브 중복 제거 키. 재전송해도 같은 값을 쓴다.
    event_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)

    occurred_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    level: Mapped[str] = mapped_column(String(10), index=True)
    tier: Mapped[str] = mapped_column(String(2), default=TIER_TELEMETRY)
    # `카테고리.이름` 형태 (예: auth.login_succeeded).
    kind: Mapped[str] = mapped_column(String(80), index=True)
    message: Mapped[str | None] = mapped_column(String(4000), nullable=True)

    # 요청 상관관계 · 행위자. 행위자는 원본 대신 사용자 ID 를 그대로 쓰되
    # 허브로 보낼 때는 해시로 바꾼다 (허브 계약: 원본 식별자 금지).
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # FK 를 걸지 않는다 — 로그는 업무 트랜잭션과 분리된 세션으로 쓰이므로
    # 아직 커밋되지 않은 사용자(가입 직후)나 삭제된 사용자도 가리킬 수 있어야 한다.
    user_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    source: Mapped[str | None] = mapped_column(String(80), nullable=True)

    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(32), nullable=True)

    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stack: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 허브 전송 상태: pending | sent | skipped | failed
    forward_state: Mapped[str] = mapped_column(String(10), default="pending", index=True)


Index("ix_app_log_events_level_time", AppLogEvent.level, AppLogEvent.occurred_at)
Index("ix_app_log_events_kind_time", AppLogEvent.kind, AppLogEvent.occurred_at)
