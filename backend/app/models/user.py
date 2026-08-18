"""사용자, 인증 세션, 계정 보안 모델."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.codes import CodedStr
from app.models.base import AuditMixin, pk_column, public_id_column

PLAN_FREE = "Free"
PLAN_PRO = "Pro"
PLAN_TEAM = "Team"
PLAN_ADMIN = "Admin"


class User(Base, AuditMixin):
    __tablename__ = "mst_user"
    __table_args__ = (
        Index("ix_mst_user_status_deleted", "status_cd", "deleted_at"),
    )

    pk: Mapped[int] = pk_column("user_id")
    id: Mapped[str] = public_id_column("u")
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column("user_nm", String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar: Mapped[str | None] = mapped_column("avatar_url", String(512), nullable=True)

    plan: Mapped[str] = mapped_column(
        "plan_cd", CodedStr("USER_PLAN"), default=PLAN_FREE
    )
    credits: Mapped[int] = mapped_column("credit_qty", Integer, default=0)
    monthly_used: Mapped[int] = mapped_column("monthly_used_cnt", Integer, default=0)
    monthly_limit: Mapped[int] = mapped_column("monthly_limit_cnt", Integer, default=3)

    status: Mapped[str] = mapped_column(
        "status_cd", CodedStr("USER_STATUS"), default="Active"
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    email_verified: Mapped[bool] = mapped_column(
        "is_email_verified", Boolean, default=False
    )
    two_factor_enabled: Mapped[bool] = mapped_column(
        "is_two_factor_enabled", Boolean, default=False
    )
    two_factor_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    two_factor_backup_codes: Mapped[list | None] = mapped_column(
        "backup_code_json", JSON, nullable=True
    )

    deletion_requested_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notification_prefs: Mapped[dict | None] = mapped_column(
        "notification_pref_json", JSON, nullable=True
    )
    onboarded_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    language: Mapped[str] = mapped_column(
        "language_cd", CodedStr("USER_LANGUAGE", length=8), default="ko"
    )
    theme: Mapped[str] = mapped_column(
        "theme_cd", CodedStr("USER_THEME", length=8), default="system"
    )
    last_active_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        "login_fail_cnt", Integer, default=0
    )
    locked_until: Mapped[dt.datetime | None] = mapped_column(
        "locked_until_at", DateTime(timezone=True), nullable=True
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base, AuditMixin):
    """영속화된 리프레시 토큰 세션 (기기 목록 / 폐기 지원)."""

    __tablename__ = "trx_session"

    pk: Mapped[int] = pk_column("session_id")
    id: Mapped[str] = public_id_column("sess")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    refresh_jti: Mapped[str] = mapped_column(String(64), index=True)
    device: Mapped[str] = mapped_column("device_nm", String(255), default="Unknown device")
    ip: Mapped[str | None] = mapped_column("ip_addr", String(64), nullable=True)
    location: Mapped[str | None] = mapped_column("location_nm", String(120), nullable=True)
    last_active_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked: Mapped[bool] = mapped_column("is_revoked", Boolean, default=False)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class EmailVerification(Base, AuditMixin):
    __tablename__ = "trx_email_verification"

    pk: Mapped[int] = pk_column("verification_id")
    id: Mapped[str] = public_id_column("ev")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PasswordReset(Base, AuditMixin):
    __tablename__ = "trx_password_reset"

    pk: Mapped[int] = pk_column("reset_id")
    id: Mapped[str] = public_id_column("pr")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("mst_user.public_id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
