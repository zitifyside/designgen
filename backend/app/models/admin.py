"""관리자/운영 모델: 공지사항, 감사 로그, 피드백."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.codes import CodedStr
from app.core.database import Base
from app.models.base import AuditMixin, TimestampMixin, pk_column, public_id_column


class Announcement(Base, AuditMixin):
    __tablename__ = "mst_announcement"

    pk: Mapped[int] = pk_column("announcement_id")
    id: Mapped[str] = public_id_column("an")
    title: Mapped[str] = mapped_column("title_nm", String(200))
    body: Mapped[str] = mapped_column("body_desc", Text, default="")
    audience: Mapped[list] = mapped_column("audience_json", JSON, default=list)
    priority: Mapped[str] = mapped_column(
        "priority_cd", CodedStr("ANNOUNCEMENT_PRIORITY"), default="normal"
    )
    status: Mapped[str] = mapped_column(
        "status_cd", CodedStr("ANNOUNCEMENT_STATUS"), default="Draft"
    )
    starts_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuditLog(Base, TimestampMixin):
    __tablename__ = "log_audit"

    pk: Mapped[int] = pk_column("audit_id")
    id: Mapped[str] = public_id_column("al")
    actor: Mapped[str] = mapped_column("actor_nm", String(200))
    action: Mapped[str] = mapped_column("action_cd", String(60))
    target: Mapped[str] = mapped_column("target_nm", String(255), default="")
    ip: Mapped[str | None] = mapped_column("ip_addr", String(64), nullable=True)
    severity: Mapped[str] = mapped_column(
        "severity_cd", CodedStr("AUDIT_SEVERITY", length=10), default="info"
    )


class Feedback(Base, AuditMixin):
    __tablename__ = "trx_feedback"

    pk: Mapped[int] = pk_column("feedback_id")
    id: Mapped[str] = public_id_column("fb")
    user_email: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column("category_cd", String(20))
    title: Mapped[str] = mapped_column("title_nm", String(200))
    body: Mapped[str] = mapped_column("body_desc", Text, default="")
    status: Mapped[str] = mapped_column(
        "status_cd", CodedStr("FEEDBACK_STATUS"), default="new"
    )
    admin_response: Mapped[str | None] = mapped_column(
        "admin_response_desc", Text, nullable=True
    )
