"""관리자/운영 모델: 공지사항, 감사 로그, 피드백."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class Announcement(Base, TimestampMixin):
    __tablename__ = "announcements"

    id: Mapped[str] = id_column("an")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[list] = mapped_column(JSON, default=list)  # 대상: ["all"|"free"|"pro"|"team"]
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # 우선순위: low|normal|high
    status: Mapped[str] = mapped_column(String(12), default="Draft")  # 상태: Draft|Scheduled|Published|Archived
    starts_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = id_column("al")
    actor: Mapped[str] = mapped_column(String(200))  # 이메일 또는 'system'
    action: Mapped[str] = mapped_column(String(60))
    target: Mapped[str] = mapped_column(String(255), default="")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    severity: Mapped[str] = mapped_column(String(10), default="info")  # 심각도: info|warning|critical


class Feedback(Base, TimestampMixin):
    __tablename__ = "feedback"

    id: Mapped[str] = id_column("fb")
    user_email: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20))  # 카테고리: bug|feature|feedback
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="new")  # 상태: new|in_review|resolved|closed
    admin_response: Mapped[str | None] = mapped_column(Text, nullable=True)
