"""사용자, 인증 세션, 계정 보안 모델."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, id_column

# 플랜 코드는 프론트엔드 `Plan` 타입과 일치: Free | Pro | Team | Admin
PLAN_FREE = "Free"
PLAN_PRO = "Pro"
PLAN_TEAM = "Team"
PLAN_ADMIN = "Admin"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = id_column("u")
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar: Mapped[str | None] = mapped_column(String(512), nullable=True)

    plan: Mapped[str] = mapped_column(String(20), default=PLAN_FREE)
    credits: Mapped[int] = mapped_column(Integer, default=0)
    monthly_used: Mapped[int] = mapped_column(Integer, default=0)
    monthly_limit: Mapped[int] = mapped_column(Integer, default=3)

    status: Mapped[str] = mapped_column(String(20), default="Active")  # 상태: Active|Suspended|Deleted
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    two_factor_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)

    language: Mapped[str] = mapped_column(String(8), default="ko")
    theme: Mapped[str] = mapped_column(String(8), default="system")

    last_active_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base, TimestampMixin):
    """영속화된 리프레시 토큰 세션 (기기 목록 / 폐기 지원)."""

    __tablename__ = "sessions"

    id: Mapped[str] = id_column("sess")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    refresh_jti: Mapped[str] = mapped_column(String(64), index=True)
    device: Mapped[str] = mapped_column(String(255), default="Unknown device")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_active_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class EmailVerification(Base, TimestampMixin):
    __tablename__ = "email_verifications"

    id: Mapped[str] = id_column("ev")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PasswordReset(Base, TimestampMixin):
    __tablename__ = "password_resets"

    id: Mapped[str] = id_column("pr")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
